import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "../src/auth.ts";
import {
  attachPlaylist,
  ensurePlaylist,
  requestSync,
  retryUncertain,
  runPipeline,
} from "../src/pipeline.ts";
import { quotaDay } from "../src/store.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const user = "a".repeat(64);
const otherUser = "b".repeat(64);
const owner = `UC${"a".repeat(22)}`;
const channel = `UC${"b".repeat(22)}`;
const video = "a".repeat(11);
const playlist = "PLsyntheticDestination123";
const previousPlaylist = "PLsyntheticPrevious123";
const categoryId = "custom-listening";

async function seedConnection(uid = user): Promise<void> {
  await seedUser(uid);
  await env.DB.prepare(
    "INSERT INTO connection(user_id,channel_id,channel_title,refresh_token,access_token,expires_at,connected_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      uid,
      owner,
      "Synthetic owner",
      await seal(env, uid, "synthetic-refresh"),
      await seal(env, uid, "synthetic-access"),
      Date.now() + 3600000,
      Date.now(),
    )
    .run();
  await env.DB.prepare("UPDATE settings SET enabled=1,last_sync_at=? WHERE user_id=?")
    .bind(Date.now(), uid)
    .run();
}
async function addCategory(id = categoryId, playlistId: string | null = playlist): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO categories(user_id,id,name,playlist_id,playlist_state) VALUES(?,?,?,?,?)",
  )
    .bind(user, id, "Synthetic category", playlistId, playlistId ? "ready" : "unconfigured")
    .run();
}
async function addVideo(
  status = "queued",
  manual = 0,
  reason = "synthetic",
  id = video,
  cat: string | null = categoryId,
): Promise<void> {
  await env.DB.prepare(`INSERT INTO videos(user_id,id,channel_id,title,published_at,duration_seconds,status,category_id,manual_override,reason,discovered_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      user,
      id,
      channel,
      "Synthetic video",
      new Date().toISOString(),
      35,
      status,
      cat,
      manual,
      reason,
      Date.now(),
      Date.now(),
    )
    .run();
}
interface RemoteEntry {
  id: string;
  videoId: string;
  publishedAt?: string;
}
function provider() {
  const remote = new Map<string, RemoteEntry[]>();
  const events: string[] = [];
  let failInsert = false;
  let commitBeforeFailure = false;
  let privacy = "private";
  let providerQuota = false;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "pubsubhubbub.appspot.com") return new Response(null, { status: 202 });
    const endpoint = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (providerQuota)
      return Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 });
    if (endpoint === "subscriptions") return Response.json({ items: [] });
    if (endpoint === "channels")
      return Response.json({
        items: [
          {
            id: url.searchParams.get("id"),
            contentDetails: { relatedPlaylists: { uploads: "UUactualUploads123" } },
          },
        ],
      });
    if (endpoint === "videos")
      return Response.json({
        items: [
          {
            id: url.searchParams.get("id"),
            snippet: {
              channelId: channel,
              channelTitle: "Synthetic channel",
              title: "Synthetic video",
              description: "Synthetic metadata",
              publishedAt: new Date().toISOString(),
              liveBroadcastContent: "none",
            },
            contentDetails: { duration: "PT35S" },
          },
        ],
      });
    if (endpoint === "playlists" && method === "GET") {
      const id = url.searchParams.get("id");
      return Response.json({
        items: id
          ? [
              {
                id,
                snippet: { channelId: owner, title: "Synthetic", description: "" },
                status: { privacyStatus: privacy },
              },
            ]
          : [],
      });
    }
    if (endpoint === "playlistItems" && method === "GET") {
      const id = url.searchParams.get("playlistId") ?? "";
      const filter = url.searchParams.get("videoId");
      return Response.json({
        items: (remote.get(id) ?? [])
          .filter((item) => !filter || item.videoId === filter)
          .map((item) => ({
            id: item.id,
            snippet: { playlistId: id },
            contentDetails: {
              videoId: item.videoId,
              videoPublishedAt: item.publishedAt ?? new Date().toISOString(),
            },
          })),
      });
    }
    if (endpoint === "playlistItems" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        snippet: { playlistId: string; resourceId: { videoId: string } };
      };
      const destination = body.snippet.playlistId;
      const entry = {
        id: `synthetic-item-${events.length}`,
        videoId: body.snippet.resourceId.videoId,
      };
      events.push(`insert:${destination}`);
      if (!failInsert || commitBeforeFailure)
        remote.set(destination, [...(remote.get(destination) ?? []), entry]);
      if (failInsert) throw new Error("Synthetic lost response");
      return Response.json({ id: entry.id });
    }
    if (endpoint === "playlistItems" && method === "DELETE") {
      const itemId = url.searchParams.get("id");
      events.push(`delete:${itemId}`);
      for (const [key, entries] of remote)
        remote.set(
          key,
          entries.filter((item) => item.id !== itemId),
        );
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected synthetic request");
  });
  return {
    fetcher,
    remote,
    events,
    failInsert: (commit = false) => {
      failInsert = true;
      commitBeforeFailure = commit;
    },
    privacy: (value: string) => {
      privacy = value;
    },
    quota: () => {
      providerQuota = true;
    },
  };
}

beforeEach(async () => {
  await resetDatabase();
  await seedConnection();
  await addCategory();
});

describe("durable per-user processing", () => {
  it("does not retain a write intent when the insert preflight read definitively fails", async () => {
    await addVideo();
    const fake = provider();
    const failingRead = vi.fn<typeof fetch>(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/playlistItems") && init?.method === "GET") {
        return Response.json({ error: {} }, { status: 500 });
      }
      return fake.fetcher(input, init);
    });
    await runPipeline(env, user, failingRead);
    expect(
      (await env.DB.prepare("SELECT * FROM operations WHERE user_id=?").bind(user).all()).results,
    ).toHaveLength(0);
    expect(fake.events).toEqual([]);
    await env.DB.prepare("UPDATE videos SET next_attempt_at=0 WHERE user_id=?").bind(user).run();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
  });

  it("does not retain a write intent when quota expires during insertion preflight", async () => {
    await addVideo();
    await env.DB.prepare("INSERT INTO quota(day,units) VALUES(?,9499)").bind(quotaDay()).run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(
      (await env.DB.prepare("SELECT * FROM operations WHERE user_id=?").bind(user).all()).results,
    ).toHaveLength(0);
    expect(fake.events).toEqual([]);
    expect(
      await env.DB.prepare("SELECT attempts FROM videos WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ attempts: 0 });
  });

  it("restores retry eligibility after an uncertain insertion is found at the retry limit", async () => {
    await addVideo("error");
    await env.DB.prepare("UPDATE videos SET attempts=6 WHERE user_id=?").bind(user).run();
    await env.DB.prepare(
      "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at) VALUES(?,?,?,?,'insert','uncertain',?,?)",
    )
      .bind(user, video, categoryId, playlist, Date.now(), Date.now())
      .run();
    const fake = provider();
    fake.remote.set(playlist, [{ id: "recovered-item", videoId: video }]);
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT status,attempts FROM videos WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ status: "added", attempts: 0 });
    expect(fake.events).toEqual([]);
  });

  it("recovers a crash after a move deletion without treating it as an external removal", async () => {
    await addCategory("old-category", previousPlaylist);
    await addVideo("error");
    await env.DB.prepare("UPDATE videos SET attempts=6 WHERE user_id=?").bind(user).run();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
      ).bind(user, video, "old-category", previousPlaylist, "already-deleted-item"),
      env.DB.prepare(
        "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
      ).bind(user, video, categoryId, playlist, "new-destination-item"),
      env.DB.prepare(
        "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,item_id,created_at,updated_at) VALUES(?,?,?,?,'delete','intent',?,?,?)",
      ).bind(
        user,
        video,
        "old-category",
        previousPlaylist,
        "already-deleted-item",
        Date.now(),
        Date.now(),
      ),
    ]);
    const fake = provider();
    fake.remote.set(playlist, [{ id: "new-destination-item", videoId: video }]);
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT status,manual_override,attempts FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "added", manual_override: 0, attempts: 0 });
    expect(
      (
        await env.DB.prepare("SELECT category_id FROM playlist_entries WHERE user_id=?")
          .bind(user)
          .all()
      ).results,
    ).toEqual([{ category_id: categoryId }]);
    expect(fake.events).toEqual([]);
  });

  it("bounds delete-intent retries after a definite provider rejection", async () => {
    await addCategory("old-category", previousPlaylist);
    await addVideo("error");
    await env.DB.prepare(
      "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
    )
      .bind(user, video, "old-category", previousPlaylist, "still-present-item")
      .run();
    await env.DB.prepare(
      "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,item_id,created_at,updated_at) VALUES(?,?,?,?,'delete','intent',?,?,?)",
    )
      .bind(
        user,
        video,
        "old-category",
        previousPlaylist,
        "still-present-item",
        Date.now(),
        Date.now(),
      )
      .run();
    const fake = provider();
    fake.remote.set(previousPlaylist, [{ id: "still-present-item", videoId: video }]);
    let deletes = 0;
    const rejecting = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === "DELETE") {
        deletes++;
        return Response.json({ error: {} }, { status: 400 });
      }
      return fake.fetcher(input, init);
    });
    await runPipeline(env, user, rejecting);
    await runPipeline(env, user, rejecting);
    expect(deletes).toBe(1);
    expect(
      await env.DB.prepare("SELECT status,attempts,manual_override FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "error", attempts: 6, manual_override: 0 });
    expect(
      await env.DB.prepare("SELECT state FROM operations WHERE user_id=? AND kind='delete'")
        .bind(user)
        .first(),
    ).toMatchObject({ state: "intent" });
  });

  it("learns historical series membership without enrolling videos outside the backfill window", async () => {
    const source = "PLsyntheticSource123";
    const recent = "b".repeat(11);
    await env.DB.prepare(
      "INSERT INTO series(user_id,id,name,playlist_id,category_id,mode,started_at) VALUES(?,?,?,?,?,'follow',?)",
    )
      .bind(user, "series", "Synthetic series", source, categoryId, Date.now())
      .run();
    const fake = provider();
    fake.remote.set(source, [
      {
        id: "old",
        videoId: video,
        publishedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      },
      { id: "recent", videoId: recent, publishedAt: new Date().toISOString() },
    ]);
    await runPipeline(env, user, fake.fetcher);
    expect(
      (await env.DB.prepare("SELECT * FROM series_videos WHERE user_id=?").bind(user).all())
        .results,
    ).toHaveLength(2);
    expect(
      await env.DB.prepare("SELECT id FROM videos WHERE user_id=? AND id=?")
        .bind(user, video)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT status FROM videos WHERE user_id=? AND id=?")
        .bind(user, recent)
        .first(),
    ).toMatchObject({ status: "added" });
  });

  it("preserves candidate retry allowances when the provider rejects the cached access token", async () => {
    await addVideo();
    await addVideo("queued", 0, "synthetic", "b".repeat(11));
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    await runPipeline(env, user, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await env.DB.prepare("SELECT attempts FROM videos WHERE user_id=?").bind(user).all())
        .results,
    ).toEqual([{ attempts: 0 }, { attempts: 0 }]);
    expect(
      await env.DB.prepare("SELECT reconnect_required FROM connection WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ reconnect_required: 1 });
  });

  it("requires explicit confirmation and current ownership/version before clearing an absent uncertain write", async () => {
    await addVideo("error", 1, "manual:assign");
    await env.DB.prepare(
      "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at) VALUES(?,?,?,?,'insert','uncertain',?,?)",
    )
      .bind(user, video, categoryId, playlist, Date.now(), Date.now())
      .run();
    const fake = provider();
    await expect(retryUncertain(env, user, video, 0, "", fake.fetcher)).rejects.toMatchObject({
      status: 400,
      code: "confirmation_required",
    });
    await expect(
      retryUncertain(env, user, video, 99, "checked_playlist_absent", fake.fetcher),
    ).rejects.toMatchObject({ status: 409, code: "stale" });
    await seedConnection(otherUser);
    await expect(
      retryUncertain(env, otherUser, video, 0, "checked_playlist_absent", fake.fetcher),
    ).rejects.toMatchObject({ status: 404 });
    expect(fake.fetcher).not.toHaveBeenCalled();
    await retryUncertain(env, user, video, 0, "checked_playlist_absent", fake.fetcher);
    expect(
      (await env.DB.prepare("SELECT * FROM operations WHERE user_id=?").bind(user).all()).results,
    ).toHaveLength(0);
    expect(
      await env.DB.prepare("SELECT status,manual_override,version FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "queued", manual_override: 1, version: 1 });
    expect(fake.events).toEqual([]);
  });

  it("adopts an already committed uncertain insertion during explicit recovery instead of inserting again", async () => {
    await addVideo("error", 1, "manual:assign");
    await env.DB.prepare(
      "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at) VALUES(?,?,?,?,'insert','uncertain',?,?)",
    )
      .bind(user, video, categoryId, playlist, Date.now(), Date.now())
      .run();
    const fake = provider();
    fake.remote.set(playlist, [{ id: "committed-item", videoId: video }]);
    await retryUncertain(env, user, video, 0, "checked_playlist_absent", fake.fetcher);
    expect(
      await env.DB.prepare("SELECT state,item_id FROM operations WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ state: "done", item_id: "committed-item" });
    expect(
      await env.DB.prepare("SELECT item_id FROM playlist_entries WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ item_id: "committed-item" });
    expect(fake.events).toEqual([]);
  });

  it("refuses uncertain-write recovery when the destination is public or has duplicate matches", async () => {
    await addVideo("error", 1, "manual:assign");
    await env.DB.prepare(
      "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at) VALUES(?,?,?,?,'insert','uncertain',?,?)",
    )
      .bind(user, video, categoryId, playlist, Date.now(), Date.now())
      .run();
    const fake = provider();
    fake.privacy("public");
    await expect(
      retryUncertain(env, user, video, 0, "checked_playlist_absent", fake.fetcher),
    ).rejects.toMatchObject({ code: "playlist_must_be_owned_and_private" });
    fake.privacy("private");
    fake.remote.set(playlist, [
      { id: "one", videoId: video },
      { id: "two", videoId: video },
    ]);
    await expect(
      retryUncertain(env, user, video, 0, "checked_playlist_absent", fake.fetcher),
    ).rejects.toMatchObject({ code: "playlist_reconciliation_ambiguous" });
    expect(
      await env.DB.prepare("SELECT state FROM operations WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ state: "uncertain" });
  });

  it("enriches and classifies incoming metadata then inserts once into a verified private playlist", async () => {
    await addVideo("pending", 0, "", video, null);
    await env.DB.prepare("UPDATE videos SET duration_seconds=NULL WHERE user_id=?")
      .bind(user)
      .run();
    const rule = {
      id: "rule",
      name: "Synthetic",
      enabled: true,
      priority: 1,
      action: "categorize",
      categoryId,
      channelId: channel,
      titleIncludes: [],
      titleExcludes: [],
      descriptionIncludes: [],
      minDurationSeconds: null,
      maxDurationSeconds: null,
      kind: "any",
    };
    await env.DB.prepare(
      "INSERT INTO rules(user_id,id,definition,priority,updated_at) VALUES(?,?,?,?,?)",
    )
      .bind(user, rule.id, JSON.stringify(rule), 1, Date.now())
      .run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT status,title,duration_seconds FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "added", title: "Synthetic video", duration_seconds: 35 });
    expect(fake.events).toEqual([`insert:${playlist}`]);
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
    expect(
      await env.DB.prepare("SELECT state FROM operations WHERE user_id=? AND kind='insert'")
        .bind(user)
        .first(),
    ).toMatchObject({ state: "done" });
  });

  it("allows manual moves while paused and adds the new destination before deleting exact tracked items", async () => {
    await addCategory("old-category", previousPlaylist);
    await addVideo("queued", 1, "manual:assign");
    await env.DB.prepare("UPDATE settings SET enabled=0 WHERE user_id=?").bind(user).run();
    await env.DB.prepare(
      "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
    )
      .bind(user, video, "old-category", previousPlaylist, "old-managed-item")
      .run();
    const fake = provider();
    fake.remote.set(previousPlaylist, [
      { id: "old-managed-item", videoId: video },
      { id: "untracked-item", videoId: "b".repeat(11) },
    ]);
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`, "delete:old-managed-item"]);
    expect(fake.remote.get(previousPlaylist)).toEqual([
      { id: "untracked-item", videoId: "b".repeat(11) },
    ]);
  });

  it("holds automatic additions and exclusions while paused", async () => {
    await addVideo();
    await env.DB.prepare("UPDATE settings SET enabled=0 WHERE user_id=?").bind(user).run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([]);
    await env.DB.prepare("UPDATE videos SET status='excluded' WHERE user_id=?").bind(user).run();
    await env.DB.prepare(
      "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
    )
      .bind(user, video, categoryId, playlist, "managed-item")
      .run();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([]);
  });

  it("defers a manually queued live video until its actual end", async () => {
    await addVideo("queued", 1, "manual:assign");
    await env.DB.prepare("UPDATE videos SET live_state='live' WHERE user_id=?").bind(user).run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([]);
    expect(
      await env.DB.prepare("SELECT status,manual_override,category_id FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "deferred", manual_override: 1, category_id: categoryId });
  });

  it("recovers a committed insertion after a lost response without a duplicate write", async () => {
    await addVideo();
    const fake = provider();
    fake.failInsert(true);
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT state FROM operations WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ state: "uncertain" });
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
    expect(
      await env.DB.prepare("SELECT status FROM videos WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ status: "added" });
    expect(
      await env.DB.prepare("SELECT item_id FROM playlist_entries WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ item_id: "synthetic-item-0" });
  });

  it("never blindly retries an absent ambiguous insertion or a crash-left intent", async () => {
    await addVideo();
    const fake = provider();
    fake.failInsert();
    await runPipeline(env, user, fake.fetcher);
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
    await env.DB.prepare("UPDATE operations SET state='intent' WHERE user_id=?").bind(user).run();
    await env.DB.prepare("UPDATE videos SET next_attempt_at=0 WHERE user_id=?").bind(user).run();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
    expect(
      await env.DB.prepare("SELECT state FROM operations WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ state: "uncertain" });
  });

  it("makes external removals sticky before a rule change can add a different destination", async () => {
    await addCategory("old-category", previousPlaylist);
    await addVideo("pending", 0, "rule:changed");
    await env.DB.prepare(
      "INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)",
    )
      .bind(user, video, "old-category", previousPlaylist, "externally-removed")
      .run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([]);
    expect(
      await env.DB.prepare("SELECT status,manual_override FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "removed", manual_override: 1 });
  });

  it("rejects public playlists and protects all other users' data", async () => {
    await addVideo();
    await seedConnection(otherUser);
    const fake = provider();
    fake.privacy("public");
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([]);
    expect(
      await env.DB.prepare("SELECT status,attempts,last_error FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({
      status: "error",
      attempts: 6,
      last_error: "playlist_must_be_owned_and_private",
    });
    expect(
      await env.DB.prepare("SELECT units FROM user_quota WHERE user_id=?").bind(otherUser).first(),
    ).toBeNull();
  });

  it("postpones provider quota failures without exhausting per-video retries", async () => {
    await addVideo();
    const fake = provider();
    fake.quota();
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT status,attempts,last_error FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "queued", attempts: 0, last_error: "provider_quota_exhausted" });
    expect(
      await env.DB.prepare("SELECT units FROM quota WHERE day=?").bind(quotaDay()).first(),
    ).not.toBeNull();
  });

  it("applies series holds before rules and follows a configured dynamic category", async () => {
    await addVideo("pending", 0, "", video, null);
    await env.DB.prepare(
      "INSERT INTO series(user_id,id,name,playlist_id,category_id,mode,started_at,last_checked_at) VALUES(?,?,?,?,?,'hold',?,?)",
    )
      .bind(
        user,
        "series",
        "Synthetic series",
        "PLsyntheticSource123",
        categoryId,
        Date.now(),
        Date.now(),
      )
      .run();
    await env.DB.prepare("INSERT INTO series_videos(user_id,series_id,video_id) VALUES(?,?,?)")
      .bind(user, "series", video)
      .run();
    const fake = provider();
    await runPipeline(env, user, fake.fetcher);
    expect(
      await env.DB.prepare("SELECT status,reason FROM videos WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ status: "review", reason: "series_hold" });
    await env.DB.prepare("UPDATE series SET mode='follow' WHERE user_id=?").bind(user).run();
    await env.DB.prepare("UPDATE videos SET status='pending' WHERE user_id=?").bind(user).run();
    await runPipeline(env, user, fake.fetcher);
    expect(fake.events).toEqual([`insert:${playlist}`]);
  });

  it("does not recreate an ambiguously created category playlist", async () => {
    await addCategory("new-category", null);
    let creates = 0;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") {
        creates++;
        throw new Error("Synthetic create timeout");
      }
      return Response.json({ items: [] });
    });
    await expect(ensurePlaylist(env, user, "new-category", fetcher)).rejects.toMatchObject({
      ambiguous: true,
    });
    await expect(ensurePlaylist(env, user, "new-category", fetcher)).rejects.toMatchObject({
      code: "playlist_creation_uncertain_attach_manually",
    });
    expect(creates).toBe(1);
  });

  it("refuses replacing a managed playlist mapping and lets sync be requested inside the service lease", async () => {
    const fake = provider();
    await expect(
      attachPlaylist(env, user, categoryId, previousPlaylist, fake.fetcher),
    ).rejects.toMatchObject({ code: "playlist_migration_required" });
    await env.DB.prepare("INSERT INTO leases(name,owner,expires_at) VALUES(?,?,?)")
      .bind(`${user}:pipeline`, "service-owner", Date.now() + 120000)
      .run();
    await requestSync(env, user);
    expect(
      await env.DB.prepare("SELECT last_sync_at FROM settings WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ last_sync_at: null });
    await expect(runPipeline(env, user, fake.fetcher)).rejects.toMatchObject({
      code: "pipeline_busy",
    });
  });
});
