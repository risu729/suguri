import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebSub, parseFeed, renewSubscriptions, topicForChannel } from "../src/websub.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const user = "a".repeat(64);
const other = "b".repeat(64);
const channel = `UC${"a".repeat(22)}`;
const video = "a".repeat(11);
const token = "t".repeat(43);
const secret = "synthetic-hub-secret";
const callback = `${env.APP_ORIGIN}/websub/${user}/${channel}/${token}`;

function feed(id = video, channelId = channel): string {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <link rel="self" href="${topicForChannel(channel)}"/><entry><yt:videoId>${id}</yt:videoId><yt:channelId>${channelId}</yt:channelId><title>Synthetic &amp; safe</title></entry></feed>`;
}
async function signed(body: string, override?: string): Promise<Request> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return new Request(callback, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/atom+xml",
      "X-Hub-Signature": override ?? `sha256=${hex}`,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(user);
  await seedUser(other);
  await env.DB.prepare(
    "INSERT INTO channels(user_id,id,callback_token,hub_secret,lease_expires_at,renew_after) VALUES(?,?,?,?,?,?)",
  )
    .bind(user, channel, token, secret, Date.now() + 3600000, Date.now() + 1800000)
    .run();
});

describe("authenticated WebSub ingestion", () => {
  it("persists validated video IDs before acknowledgement and isolates users", async () => {
    expect((await handleWebSub(await signed(feed()), env)).status).toBe(204);
    expect(
      await env.DB.prepare("SELECT id,status FROM videos WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ id: video, status: "pending" });
    expect(
      await env.DB.prepare("SELECT id FROM videos WHERE user_id=?").bind(other).first(),
    ).toBeNull();
  });

  it("does not reset a sticky manual decision or added membership on duplicate delivery", async () => {
    await handleWebSub(await signed(feed()), env);
    await env.DB.prepare(
      "UPDATE videos SET status='excluded',manual_override=1,version=7 WHERE user_id=?",
    )
      .bind(user)
      .run();
    expect((await handleWebSub(await signed(feed()), env)).status).toBe(204);
    expect(
      await env.DB.prepare("SELECT status,manual_override,version FROM videos WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ status: "excluded", manual_override: 1, version: 7 });
  });

  it("rejects missing/invalid HMAC and expired subscriptions", async () => {
    expect(
      (await handleWebSub(new Request(callback, { method: "POST", body: feed() }), env)).status,
    ).toBe(403);
    expect((await handleWebSub(await signed(feed(), `sha256=${"0".repeat(64)}`), env)).status).toBe(
      403,
    );
    await env.DB.prepare("UPDATE channels SET lease_expires_at=0 WHERE user_id=?").bind(user).run();
    expect((await handleWebSub(await signed(feed()), env)).status).toBe(410);
    expect(await env.DB.prepare("SELECT id FROM videos").first()).toBeNull();
  });

  it("rejects DTD, wrong namespaces, mismatched topics/channels and oversized feeds", async () => {
    expect(() =>
      parseFeed(`<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///private">]>${feed()}`, channel),
    ).toThrow();
    expect(() =>
      parseFeed(
        feed().replace(
          "http://www.youtube.com/xml/schemas/2015",
          "https://untrusted.example.invalid",
        ),
        channel,
      ),
    ).toThrow();
    expect(() => parseFeed(feed(video, `UC${"b".repeat(22)}`), channel)).toThrow();
    expect(() =>
      parseFeed(
        feed().replace(topicForChannel(channel), "https://untrusted.example.invalid"),
        channel,
      ),
    ).toThrow();
    expect((await handleWebSub(await signed("x".repeat(256 * 1024 + 1)), env)).status).toBe(413);
    const entry = `<entry><yt:videoId>${video}</yt:videoId><yt:channelId>${channel}</yt:channelId></entry>`;
    expect(() =>
      parseFeed(feed().replace(/<entry>[\s\S]*<\/entry>/, entry.repeat(101)), channel),
    ).toThrow();
  });

  it("accepts legal numeric XML whitespace while rejecting invalid control characters", async () => {
    const body = feed().replace("Synthetic &amp; safe", "Line&#10;break&#9;tab&#13;return");
    expect((await handleWebSub(await signed(body), env)).status).toBe(204);
    expect(() =>
      parseFeed(feed().replace("Synthetic &amp; safe", "Illegal&#1;control"), channel),
    ).toThrow();
  });

  it("accepts a lease challenge only for a durable matching intent and serves an inert response", async () => {
    const url = new URL(callback);
    url.search = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.topic": topicForChannel(channel),
      "hub.challenge": "<script>synthetic</script>",
      "hub.lease_seconds": "86400",
    }).toString();
    expect((await handleWebSub(new Request(url), env)).status).toBe(404);
    await env.DB.prepare(
      "UPDATE channels SET pending_mode='subscribe',pending_until=? WHERE user_id=?",
    )
      .bind(Date.now() + 60000, user)
      .run();
    const response = await handleWebSub(new Request(url), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("<script>synthetic</script>");
    expect(
      await env.DB.prepare("SELECT pending_mode,lease_expires_at FROM channels WHERE user_id=?")
        .bind(user)
        .first(),
    ).toMatchObject({ pending_mode: null, lease_expires_at: expect.any(Number) });
    expect((await handleWebSub(new Request(url), env)).status).toBe(404);
  });

  it("persists renewal intent before contacting only the fixed HTTPS hub", async () => {
    await env.DB.prepare("UPDATE channels SET renew_after=0 WHERE user_id=?").bind(user).run();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://pubsubhubbub.appspot.com/subscribe");
      expect(new Request(input, init).redirect).toBe("manual");
      const params = new URLSearchParams(String(init?.body));
      expect(params.get("hub.callback")).toBe(callback);
      expect(params.get("hub.secret")).toBe(secret);
      expect(
        await env.DB.prepare("SELECT pending_mode FROM channels WHERE user_id=?")
          .bind(user)
          .first(),
      ).toMatchObject({ pending_mode: "subscribe" });
      return new Response(null, { status: 202 });
    });
    await renewSubscriptions(env, user, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT last_error FROM channels WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ last_error: null });
  });

  it("rejects hub redirects without forwarding callback capabilities", async () => {
    await env.DB.prepare("UPDATE channels SET renew_after=0 WHERE user_id=?").bind(user).run();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(new Request(input, init).redirect).toBe("manual");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://untrusted.example.invalid/" },
      });
    });
    await renewSubscriptions(env, user, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT last_error FROM channels WHERE user_id=?").bind(user).first(),
    ).toMatchObject({ last_error: "hub_request_failed" });
  });
});
