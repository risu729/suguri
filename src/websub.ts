import { channelIdPattern, videoIdPattern, type Fetcher } from "./youtube.ts";

const atom = "http://www.w3.org/2005/Atom";
const youtube = "http://www.youtube.com/xml/schemas/2015";
const maxBytes = 256 * 1024;
const hub = "https://pubsubhubbub.appspot.com/subscribe";
export const topicForChannel = (id: string): string =>
  `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${id}`;

interface Channel {
  user_id: string;
  id: string;
  active: number;
  callback_token: string;
  hub_secret: string;
  lease_expires_at: number;
  pending_mode: "subscribe" | "unsubscribe" | null;
  pending_until: number;
}

function decodeXml(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(value))
    throw new Error("invalid_xml_entity");
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity) => {
    const named: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    if (named[entity]) return named[entity];
    const number = entity.startsWith("&#x")
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number(entity.slice(2, -1));
    if (
      !Number.isSafeInteger(number) ||
      (number < 32 && number !== 9 && number !== 10 && number !== 13) ||
      number > 0x10ffff ||
      (number >= 0xd800 && number <= 0xdfff)
    ) {
      throw new Error("invalid_xml_entity");
    }
    return String.fromCodePoint(number);
  });
}

// A bounded, namespace-aware Atom reader. It never expands declarations or resolves URLs.
export function parseFeed(xml: string, channelId: string): string[] {
  if (xml.length > maxBytes || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_feed");
  const stack: {
    name: string;
    local: string;
    ns: string;
    namespaces: Record<string, string>;
    value: string;
  }[] = [];
  const videos: string[] = [];
  let entry: { id?: string; channel?: string } | null = null;
  let root = false;
  let closed = false;
  let topic = false;
  let entries = 0;
  let offset = 0;
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g;
  for (const token of xml.matchAll(tokens)) {
    if (token.index !== offset) throw new Error("invalid_xml");
    const value = token[0];
    offset += value.length;
    if (value.startsWith("<!--")) continue;
    if (value.startsWith("<?")) {
      if (root || !value.startsWith("<?xml ")) throw new Error("invalid_xml");
      continue;
    }
    if (!value.startsWith("<") || value.startsWith("<![CDATA[")) {
      const content = value.startsWith("<![CDATA[") ? value.slice(9, -3) : decodeXml(value);
      if (!stack.length && content.trim()) throw new Error("invalid_xml");
      const current = stack.at(-1);
      if (
        current &&
        current.ns === youtube &&
        (current.local === "videoId" || current.local === "channelId")
      ) {
        current.value += content;
      }
      continue;
    }
    if (value.startsWith("</")) {
      const name = /^<\/([A-Za-z_][\w:.-]*)\s*>$/.exec(value)?.[1];
      const current = stack.pop();
      if (!current || current.name !== name) throw new Error("invalid_xml");
      if (entry && current.ns === youtube && current.local === "videoId") {
        if (entry.id !== undefined) throw new Error("invalid_feed");
        entry.id = current.value.trim();
      }
      if (entry && current.ns === youtube && current.local === "channelId") {
        if (entry.channel !== undefined) throw new Error("invalid_feed");
        entry.channel = current.value.trim();
      }
      if (current.ns === atom && current.local === "entry") {
        if (!entry || !entry.id || !videoIdPattern.test(entry.id) || entry.channel !== channelId)
          throw new Error("invalid_feed");
        videos.push(entry.id);
        entry = null;
      }
      if (!stack.length) closed = true;
      continue;
    }
    const start = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(value);
    if (!start || closed || stack.length >= 32) throw new Error("invalid_xml");
    const name = start[1] ?? "";
    const attrs: Record<string, string> = {};
    let remaining = start[2] ?? "";
    while (remaining.trim()) {
      const attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(remaining);
      if (!attr || attr[1] === undefined || Object.hasOwn(attrs, attr[1]))
        throw new Error("invalid_xml");
      attrs[attr[1]] = decodeXml(attr[2] ?? attr[3] ?? "");
      remaining = remaining.slice(attr[0].length);
    }
    const namespaces = { ...(stack.at(-1)?.namespaces ?? {}) };
    for (const [key, content] of Object.entries(attrs)) {
      if (key === "xmlns") namespaces[""] = content;
      else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = content;
    }
    const parts = name.split(":");
    if (parts.length > 2) throw new Error("invalid_xml");
    const local = parts.at(-1) ?? "";
    const ns = namespaces[parts.length === 2 ? (parts[0] ?? "") : ""] ?? "";
    if (!root) {
      if (local !== "feed" || ns !== atom) throw new Error("invalid_feed");
      root = true;
    }
    if (ns === atom && local === "entry") {
      if (entry || stack.length !== 1 || ++entries > 100) throw new Error("invalid_feed");
      entry = {};
    }
    if (ns === atom && local === "link" && stack.length === 1 && attrs["rel"] === "self") {
      if (topic || attrs["href"] !== topicForChannel(channelId))
        throw new Error("invalid_feed_topic");
      topic = true;
    }
    if (
      ns === youtube &&
      (local === "videoId" || local === "channelId") &&
      stack.at(-1)?.local !== "entry"
    ) {
      // Channel identifiers in the feed header are harmless, but do not count as entry identity.
      if (entry) throw new Error("invalid_feed");
    }
    if (start[3] === "/") {
      if (local === "entry" || ns === youtube) throw new Error("invalid_feed");
      if (!stack.length) closed = true;
    } else stack.push({ name, local, ns, namespaces, value: "" });
  }
  if (offset !== xml.length || stack.length || !root || !closed || !topic)
    throw new Error("invalid_feed");
  return [...new Set(videos)];
}

async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new Error("body_too_large");
  if (!request.body) throw new Error("invalid_feed");
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("body_timeout")), 5000);
  });
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Bound every streamed chunk before accepting the next.
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      if (size + chunk.value.byteLength > maxBytes) throw new Error("body_too_large");
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await Promise.race([reader.cancel().catch(() => undefined), Promise.resolve()]);
    reader.releaseLock();
  }
  return bytes.slice(0, size);
}

async function verifySignature(
  secret: string,
  signature: string | null,
  body: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const match = /^(sha1|sha256|sha384|sha512)=([0-9a-fA-F]+)$/.exec(signature ?? "");
  if (!match) return false;
  const algorithms: Record<string, { hash: string; length: number }> = {
    sha1: { hash: "SHA-1", length: 40 },
    sha256: { hash: "SHA-256", length: 64 },
    sha384: { hash: "SHA-384", length: 96 },
    sha512: { hash: "SHA-512", length: 128 },
  };
  const algorithm = algorithms[match[1] ?? ""];
  const hex = match[2] ?? "";
  if (!algorithm || hex.length !== algorithm.length) return false;
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (part) => Number.parseInt(part, 16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm.hash },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, bytes, body);
}

function sameToken(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function handleWebSub(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path =
    /^\/websub\/([A-Za-z0-9_-]{16,128})\/(UC[A-Za-z0-9_-]{22})\/([A-Za-z0-9_-]{32,128})$/.exec(
      url.pathname,
    );
  if (!path) return new Response("Not found", { status: 404 });
  const userId = path[1] ?? "";
  const channelId = path[2] ?? "";
  const channel = await env.DB.prepare("SELECT * FROM channels WHERE user_id=? AND id=?")
    .bind(userId, channelId)
    .first<Channel>();
  if (!channel || !sameToken(channel.callback_token, path[3] ?? ""))
    return new Response("Not found", { status: 404 });
  const now = Date.now();
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const leaseText = url.searchParams.get("hub.lease_seconds") ?? "";
    const lease = /^\d{1,8}$/.test(leaseText) ? Number(leaseText) : 0;
    if (
      channel.pending_until < now ||
      !channel.pending_mode ||
      channel.pending_mode !== mode ||
      url.searchParams.get("hub.topic") !== topicForChannel(channelId) ||
      !challenge ||
      challenge.length > 1024 ||
      (mode === "subscribe" && (!channel.active || lease < 1 || lease > 2592000)) ||
      (mode === "unsubscribe" && channel.active)
    )
      return new Response("Invalid intent", { status: 404 });
    const result = await env.DB.prepare(`UPDATE channels SET pending_mode=NULL,pending_until=0,
      lease_expires_at=?,renew_after=?,last_error=NULL WHERE user_id=? AND id=? AND pending_mode=? AND pending_until>=?`)
      .bind(
        mode === "subscribe" ? now + lease * 1000 : 0,
        mode === "subscribe" ? now + Math.floor(lease * 700) : 0,
        userId,
        channelId,
        mode,
        now,
      )
      .run();
    if (!result.meta.changes) return new Response("Invalid intent", { status: 404 });
    return new Response(challenge, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  if (!channel.active || channel.lease_expires_at <= now)
    return new Response("Inactive subscription", { status: 410 });
  let validated = false;
  try {
    const body = await readBody(request);
    if (!(await verifySignature(channel.hub_secret, request.headers.get("x-hub-signature"), body)))
      return new Response("Invalid signature", { status: 403 });
    const ids = parseFeed(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body),
      channelId,
    );
    validated = true;
    if (ids.length)
      await env.DB.batch(
        ids.map((id) =>
          env.DB.prepare(`INSERT INTO videos(user_id,id,channel_id,discovered_at,updated_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM channels WHERE user_id=? AND id=? AND active=1 AND lease_expires_at>?)
      ON CONFLICT(user_id,id) DO UPDATE SET metadata_dirty=1`).bind(
            userId,
            id,
            channelId,
            now,
            now,
            userId,
            channelId,
            now,
          ),
        ),
      );
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(validated ? "Persistence unavailable" : "Invalid notification", {
      status: validated
        ? 503
        : error instanceof Error && error.message === "body_too_large"
          ? 413
          : 400,
    });
  }
}

export async function renewSubscriptions(
  env: Env,
  userId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const now = Date.now();
  const rows =
    await env.DB.prepare(`SELECT * FROM channels WHERE user_id=? AND pending_until<=? AND renew_after<=?
    AND (active=1 OR lease_expires_at>0) ORDER BY renew_after LIMIT 3`)
      .bind(userId, now, now)
      .all<Channel>();
  for (const channel of rows.results) {
    if (!channelIdPattern.test(channel.id)) continue;
    const mode = channel.active ? "subscribe" : "unsubscribe";
    // oxlint-disable-next-line no-await-in-loop -- Persist intent before the hub may synchronously verify it.
    await env.DB.prepare(
      "UPDATE channels SET pending_mode=?,pending_until=?,renew_after=? WHERE user_id=? AND id=?",
    )
      .bind(mode, now + 600000, now + 900000, userId, channel.id)
      .run();
    const callback = new URL(
      `/websub/${userId}/${channel.id}/${channel.callback_token}`,
      env.APP_ORIGIN,
    );
    const form = new URLSearchParams({
      "hub.mode": mode,
      "hub.topic": topicForChannel(channel.id),
      "hub.callback": callback.href,
      "hub.secret": channel.hub_secret,
      "hub.lease_seconds": "864000",
      "hub.verify": "async",
    });
    try {
      // oxlint-disable-next-line no-await-in-loop -- Bound hub requests sequentially within the tick's lease.
      const response = await fetcher(hub, {
        method: "POST",
        redirect: "manual",
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      // oxlint-disable-next-line no-await-in-loop -- Discard response bodies without retaining private callback data.
      await response.body?.cancel();
      if (!response.ok) throw new Error("hub_request_failed");
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- Retain the intent because a lost response may still be verified.
      await env.DB.prepare(
        "UPDATE channels SET last_error='hub_request_failed' WHERE user_id=? AND id=?",
      )
        .bind(userId, channel.id)
        .run();
    }
  }
}
