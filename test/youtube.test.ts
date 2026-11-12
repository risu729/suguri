import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "../src/auth.ts";
import { quotaDay } from "../src/store.ts";
import { durationSeconds, reserveQuota, YouTube } from "../src/youtube.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const user = "a".repeat(64);
const owner = `UC${"a".repeat(22)}`;
const video = "a".repeat(11);

beforeEach(async () => {
  await resetDatabase();
  await seedUser(user);
  await env.DB.prepare(
    "INSERT INTO connection(user_id,channel_id,channel_title,refresh_token,access_token,expires_at,connected_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      user,
      owner,
      "Synthetic channel",
      await seal(env, user, "synthetic-refresh"),
      await seal(env, user, "synthetic-access"),
      Date.now() + 3600000,
      Date.now(),
    )
    .run();
});

describe("YouTube provider boundary", () => {
  it("rejects redirects without forwarding bearer credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(new Request(input, init).redirect).toBe("manual");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://untrusted.example.invalid/" },
      });
    });
    await expect(new YouTube(env, user, fetcher).video(video)).rejects.toMatchObject({
      code: "youtube_http_307",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("parses durations without using duration to guess Shorts", () => {
    expect(durationSeconds("PT35S")).toBe(35);
    expect(durationSeconds("P0D")).toBe(0);
    expect(durationSeconds("P1DT2H3M4S")).toBe(93784);
    expect(() => durationSeconds("not-a-duration")).toThrow();
  });

  it("uses bearer auth and validated metadata with a safe thumbnail origin", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(new URL(String(input)).origin).toBe("https://www.googleapis.com");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-access");
      expect(new Request(input, init).redirect).toBe("manual");
      return Response.json({
        items: [
          {
            id: video,
            snippet: {
              channelId: owner,
              channelTitle: "Synthetic",
              title: "A short upload",
              description: "Synthetic fixture",
              publishedAt: new Date().toISOString(),
              liveBroadcastContent: "none",
              thumbnails: { default: { url: "https://untrusted.example.invalid/x" } },
            },
            contentDetails: { duration: "PT35S" },
          },
        ],
      });
    });
    const result = await new YouTube(env, user, fetcher).video(video);
    expect(result?.durationSeconds).toBe(35);
    expect(result?.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${video}/mqdefault.jpg`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not automatically repeat ambiguous mutations", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("synthetic lost response");
    });
    await expect(
      new YouTube(env, user, fetcher).insert("PLsynthetic123456", video),
    ).rejects.toMatchObject({ code: "youtube_transport_error", ambiguous: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT insertions FROM user_quota WHERE user_id=? AND day=?")
        .bind(user, quotaDay())
        .first(),
    ).toMatchObject({ insertions: 1 });
  });

  it.each([
    { receipt: [] },
    { receipt: { id: "" } },
    { receipt: { id: "valid-item", snippet: { playlistId: "PLdifferent12345" } } },
    { receipt: { id: "valid-item", snippet: { resourceId: { videoId: "b".repeat(11) } } } },
  ])("keeps malformed successful write receipts ambiguous: %j", async ({ receipt }) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(receipt));
    await expect(
      new YouTube(env, user, fetcher).insert("PLsynthetic123456", video),
    ).rejects.toMatchObject({ code: "invalid_insert_receipt", ambiguous: true });
  });

  it("rejects empty read IDs and malformed playlist IDs before adopting provider evidence", async () => {
    const entries = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [
          {
            id: "",
            snippet: { playlistId: "PLsynthetic123456" },
            contentDetails: { videoId: video },
          },
        ],
      }),
    );
    await expect(
      new YouTube(env, user, entries).playlistItems("PLsynthetic123456", video),
    ).rejects.toMatchObject({ code: "invalid_provider_response" });
    const playlists = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [
          {
            id: "",
            snippet: { channelId: owner, title: "Synthetic" },
            status: { privacyStatus: "private" },
          },
        ],
      }),
    );
    await expect(new YouTube(env, user, playlists).ownedPlaylists(null)).rejects.toMatchObject({
      code: "invalid_provider_response",
    });
  });

  it("marks a rejected cached bearer token for reconnection and stops repeated provider calls", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    const api = new YouTube(env, user, fetcher);
    await expect(api.video(video)).rejects.toMatchObject({ code: "reconnect_required" });
    await expect(api.video(video)).rejects.toMatchObject({ code: "reconnect_required" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT reconnect_required FROM connection WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ reconnect_required: 1 });
  });

  it("reserves project and user quota before calls and enforces user insertion limits", async () => {
    await env.DB.prepare("UPDATE settings SET daily_insert_limit=1 WHERE user_id=?")
      .bind(user)
      .run();
    await reserveQuota(env.DB, user, 50, true);
    await expect(reserveQuota(env.DB, user, 50, true)).rejects.toMatchObject({
      code: "daily_quota_exhausted",
    });
    expect(
      await env.DB.prepare("SELECT units,insertions FROM user_quota WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ units: 50, insertions: 1 });
    expect(await env.DB.prepare("SELECT units FROM quota").first()).toMatchObject({ units: 50 });
    await env.DB.prepare("UPDATE quota SET units=9500").run();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ items: [] }));
    await expect(new YouTube(env, user, fetcher).video(video)).rejects.toMatchObject({
      code: "global_quota_exhausted",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not spend another user's independent insertion allowance", async () => {
    await seedUser("b".repeat(64));
    await reserveQuota(env.DB, user, 50, true);
    await reserveQuota(env.DB, "b".repeat(64), 50, true);
    expect(
      (await env.DB.prepare("SELECT user_id,insertions FROM user_quota").all()).results,
    ).toHaveLength(2);
  });

  it("atomically reserves the last project allowance across users without leaving reservation rows", async () => {
    const other = "b".repeat(64);
    await seedUser(other);
    await env.DB.prepare("INSERT INTO quota(day,units) VALUES(?,9450)").bind(quotaDay()).run();
    const attempts = await Promise.allSettled([
      reserveQuota(env.DB, user, 50, true),
      reserveQuota(env.DB, other, 50, true),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await env.DB.prepare("SELECT units,insertions FROM quota").first()).toMatchObject({
      units: 9500,
      insertions: 1,
    });
    expect(
      await env.DB.prepare("SELECT sum(units) AS units FROM user_quota").first(),
    ).toMatchObject({ units: 50 });
    expect((await env.DB.prepare("SELECT * FROM quota_reservations").all()).results).toHaveLength(
      0,
    );
  });

  it("fences a replaced processing lease before making a remote write", async () => {
    await env.DB.prepare("INSERT INTO leases(name,owner,expires_at) VALUES(?,?,?)")
      .bind(`${user}:pipeline`, "new-owner", Date.now() + 120000)
      .run();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    await expect(
      new YouTube(env, user, fetcher, Date.now() + 85000, "stale-owner").insert(
        "PLsynthetic123456",
        video,
      ),
    ).rejects.toMatchObject({ code: "pipeline_lease_lost" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves the authoritative uploads playlist through channels.list", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(new URL(String(input)).pathname.endsWith("/channels")).toBe(true);
      return Response.json({
        items: [
          { id: owner, contentDetails: { relatedPlaylists: { uploads: "UUauthoritative123" } } },
        ],
      });
    });
    expect(await new YouTube(env, user, fetcher).uploads(owner)).toBe("UUauthoritative123");
  });
});
