import { getAccessToken } from "./auth.ts";
import { getSettings, quotaDay } from "./store.ts";
import type { VideoMetadata } from "./model.ts";

export type Fetcher = typeof fetch;
export const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;
export const playlistIdPattern = /^[A-Za-z0-9_-]{10,100}$/;

export class YouTubeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly status: number;
  constructor(code: string, retryable = false, ambiguous = false, status = 0) {
    super(code);
    this.name = "YouTubeError";
    this.code = code;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
    this.status = status;
  }
}

type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new YouTubeError("invalid_provider_response", true);
  }
  return value as JsonObject;
}
export function text(value: unknown, max = 10000): string {
  if (typeof value !== "string" || value.length > max) {
    throw new YouTubeError("invalid_provider_response", true);
  }
  return value;
}
function items(value: unknown): unknown[] {
  const result = object(value)["items"];
  if (!Array.isArray(result) || result.length > 50) {
    throw new YouTubeError("invalid_provider_response", true);
  }
  return result;
}
function nextPage(value: unknown): string | null {
  const token = object(value)["nextPageToken"];
  return token === undefined ? null : text(token, 1024);
}

export async function reserveQuota(
  db: D1Database,
  userId: string,
  units: number,
  insertion = false,
): Promise<void> {
  const settings = await getSettings(db, userId);
  const date = quotaDay();
  const reservation = crypto.randomUUID();
  const results = await db.batch<{ units: number }>([
    db.prepare("INSERT INTO quota(day) VALUES(?) ON CONFLICT DO NOTHING").bind(date),
    db
      .prepare("INSERT INTO user_quota(user_id,day) VALUES(?,?) ON CONFLICT DO NOTHING")
      .bind(userId, date),
    db
      .prepare(`INSERT INTO quota_reservations(id) SELECT ? FROM quota q JOIN user_quota u ON u.day=q.day
      WHERE q.day=? AND u.user_id=? AND q.units+?<=9500 AND u.units+?<=? AND u.insertions+?<=?`)
      .bind(
        reservation,
        date,
        userId,
        units,
        units,
        settings.dailyBudgetUnits,
        Number(insertion),
        settings.dailyInsertLimit,
      ),
    db
      .prepare(
        "UPDATE quota SET units=units+?,insertions=insertions+? WHERE day=? AND EXISTS(SELECT 1 FROM quota_reservations WHERE id=?)",
      )
      .bind(units, Number(insertion), date, reservation),
    db
      .prepare(
        "UPDATE user_quota SET units=units+?,insertions=insertions+? WHERE user_id=? AND day=? AND EXISTS(SELECT 1 FROM quota_reservations WHERE id=?)",
      )
      .bind(units, Number(insertion), userId, date, reservation),
    db.prepare("DELETE FROM quota_reservations WHERE id=?").bind(reservation),
    db.prepare("SELECT units FROM quota WHERE day=?").bind(date),
  ]);
  if (!results[2]?.meta.changes) {
    const globalUnits = Number(results[6]?.results[0]?.units ?? 9500);
    throw new YouTubeError(
      globalUnits + units > 9500 ? "global_quota_exhausted" : "daily_quota_exhausted",
      true,
    );
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new YouTubeError("invalid_provider_response", true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Enforce the response bound before reading the next chunk.
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 1024 * 1024) throw new YouTubeError("provider_response_too_large", true);
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch {
    throw new YouTubeError("invalid_provider_response", true);
  }
}

export interface Playlist {
  id: string;
  channelId: string;
  privacy: string;
  title: string;
  description: string;
}
function playlist(value: unknown): Playlist {
  const row = object(value);
  const snippet = object(row["snippet"]);
  const id = text(row["id"], 100);
  const channelId = text(snippet["channelId"], 24);
  if (!playlistIdPattern.test(id) || !channelIdPattern.test(channelId))
    throw new YouTubeError("invalid_provider_response", true);
  return {
    id,
    channelId,
    privacy: text(object(row["status"])["privacyStatus"], 20),
    title: text(snippet["title"], 200),
    description: text(snippet["description"] ?? "", 10000),
  };
}

function validatedItemId(value: unknown): string {
  const id = text(value, 300);
  // oxlint-disable-next-line no-control-regex -- Provider identifiers must not contain control characters.
  if (!id || /\s|[\u0000-\u001f]/.test(id))
    throw new YouTubeError("invalid_provider_response", true);
  return id;
}

export function durationSeconds(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match || match.slice(1).every((part) => part === undefined))
    throw new YouTubeError("invalid_video_duration", true);
  const duration =
    Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  if (!Number.isFinite(duration) || duration > 31536000) {
    throw new YouTubeError("invalid_video_duration", true);
  }
  return Math.floor(duration);
}

export class YouTube {
  private remaining = 40;
  private readonly env: Env;
  private readonly userId: string;
  private readonly fetcher: Fetcher;
  private readonly deadline: number;
  private readonly leaseOwner: string | undefined;
  constructor(
    env: Env,
    userId: string,
    fetcher: Fetcher = fetch,
    deadline = Date.now() + 85000,
    leaseOwner?: string,
  ) {
    this.env = env;
    this.userId = userId;
    this.fetcher = fetcher;
    this.deadline = deadline;
    this.leaseOwner = leaseOwner;
  }

  async request(
    path: string,
    params: Record<string, string>,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    if (--this.remaining < 0 || Date.now() + 11000 > this.deadline) {
      throw new YouTubeError("tick_budget_exhausted", true);
    }
    const token = await getAccessToken(this.env, this.userId, this.fetcher);
    await reserveQuota(
      this.env.DB,
      this.userId,
      method === "GET" ? 1 : 50,
      method === "POST" && path === "playlistItems",
    );
    if (Date.now() + 11000 > this.deadline) throw new YouTubeError("tick_budget_exhausted", true);
    if (this.leaseOwner) {
      const lease = await this.env.DB.prepare(
        "SELECT owner FROM leases WHERE name=? AND owner=? AND expires_at>?",
      )
        .bind(`${this.userId}:pipeline`, this.leaseOwner, Date.now() + 11000)
        .first();
      if (!lease) throw new YouTubeError("pipeline_lease_lost", true);
    }
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetcher(url, {
        method,
        redirect: "error",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          await response.body?.cancel();
          await this.env.DB.prepare(
            "UPDATE connection SET reconnect_required=1,expires_at=0 WHERE user_id=?",
          )
            .bind(this.userId)
            .run();
          throw new YouTubeError("reconnect_required", true, false, 401);
        }
        let quotaReason = false;
        try {
          const detail = object(object(await boundedJson(response))["error"]);
          const errors = detail["errors"];
          quotaReason =
            Array.isArray(errors) &&
            errors.some((entry) => {
              const reason = object(entry)["reason"];
              return (
                reason === "quotaExceeded" ||
                reason === "dailyLimitExceeded" ||
                reason === "rateLimitExceeded" ||
                reason === "userRateLimitExceeded"
              );
            });
        } catch {
          /* Provider error bodies are untrusted and never exposed. */
        }
        if (quotaReason)
          throw new YouTubeError("provider_quota_exhausted", true, false, response.status);
        throw new YouTubeError(
          `youtube_http_${response.status}`,
          response.status === 429 || response.status >= 500,
          method !== "GET" && response.status >= 500,
          response.status,
        );
      }
      if (response.status === 204) return {};
      try {
        return await boundedJson(response);
      } catch {
        throw new YouTubeError("invalid_provider_response", true, method !== "GET");
      }
    } catch (error) {
      if (error instanceof YouTubeError) throw error;
      throw new YouTubeError("youtube_transport_error", true, method !== "GET");
    } finally {
      clearTimeout(timer);
    }
  }

  async subscriptions(
    cursor: string | null,
  ): Promise<{ channels: { id: string; title: string }[]; next: string | null }> {
    const result = await this.request("subscriptions", {
      part: "snippet",
      mine: "true",
      maxResults: "50",
      ...(cursor ? { pageToken: cursor } : {}),
    });
    return {
      channels: items(result).map((entry) => {
        const snippet = object(object(entry)["snippet"]);
        const id = text(object(snippet["resourceId"])["channelId"], 24);
        if (!channelIdPattern.test(id)) throw new YouTubeError("invalid_provider_response", true);
        return { id, title: text(snippet["title"], 200) };
      }),
      next: nextPage(result),
    };
  }

  async video(id: string): Promise<VideoMetadata | null> {
    if (!videoIdPattern.test(id)) throw new YouTubeError("invalid_video_id");
    const result = items(
      await this.request("videos", { part: "snippet,contentDetails,liveStreamingDetails", id }),
    );
    if (!result.length) return null;
    const row = object(result[0]);
    const snippet = object(row["snippet"]);
    const channelId = text(snippet["channelId"], 24);
    if (row["id"] !== id || !channelIdPattern.test(channelId)) {
      throw new YouTubeError("invalid_provider_response", true);
    }
    const live = snippet["liveBroadcastContent"];
    const stream =
      row["liveStreamingDetails"] === undefined ? {} : object(row["liveStreamingDetails"]);
    const endedAt =
      stream["actualEndTime"] === undefined ? null : text(stream["actualEndTime"], 40);
    const publishedAt = text(snippet["publishedAt"], 40);
    if (
      !Number.isFinite(Date.parse(publishedAt)) ||
      (endedAt && !Number.isFinite(Date.parse(endedAt)))
    ) {
      throw new YouTubeError("invalid_provider_response", true);
    }
    return {
      id,
      channelId,
      channelTitle: text(snippet["channelTitle"], 200),
      title: text(snippet["title"], 200),
      description: text(snippet["description"], 10000),
      publishedAt,
      durationSeconds: durationSeconds(text(object(row["contentDetails"])["duration"], 100)),
      liveState: endedAt ? "none" : live === "live" || live === "upcoming" ? live : "none",
      endedAt,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    };
  }

  async getPlaylist(id: string): Promise<Playlist> {
    if (!playlistIdPattern.test(id)) throw new YouTubeError("invalid_playlist_id");
    const rows = items(await this.request("playlists", { part: "snippet,status", id }));
    if (rows.length !== 1) throw new YouTubeError("playlist_unavailable");
    const result = playlist(rows[0]);
    if (result.id !== id) throw new YouTubeError("invalid_provider_response", true);
    return result;
  }

  async ownedPlaylists(
    cursor: string | null,
  ): Promise<{ playlists: Playlist[]; next: string | null }> {
    const result = await this.request("playlists", {
      part: "snippet,status",
      mine: "true",
      maxResults: "50",
      ...(cursor ? { pageToken: cursor } : {}),
    });
    return { playlists: items(result).map(playlist), next: nextPage(result) };
  }

  async createPlaylist(title: string, marker: string): Promise<Playlist> {
    const raw = await this.request("playlists", { part: "snippet,status" }, "POST", {
      snippet: { title, description: marker },
      status: { privacyStatus: "private" },
    });
    try {
      return playlist(raw);
    } catch {
      throw new YouTubeError("invalid_create_receipt", true, true);
    }
  }

  async playlistItems(
    playlistId: string,
    videoId?: string,
    cursor?: string,
  ): Promise<{
    entries: { id: string; videoId: string; publishedAt: string }[];
    next: string | null;
  }> {
    const result = await this.request("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      ...(videoId ? { videoId } : {}),
      ...(cursor ? { pageToken: cursor } : {}),
    });
    return {
      entries: items(result).map((entry) => {
        const row = object(entry);
        const snippet = object(row["snippet"]);
        const details = object(row["contentDetails"]);
        const id = text(details["videoId"], 11);
        if (
          !videoIdPattern.test(id) ||
          (videoId && id !== videoId) ||
          (snippet["playlistId"] !== undefined && snippet["playlistId"] !== playlistId)
        ) {
          throw new YouTubeError("invalid_provider_response", true);
        }
        return {
          id: validatedItemId(row["id"]),
          videoId: id,
          publishedAt: text(details["videoPublishedAt"] ?? snippet["publishedAt"] ?? "", 40),
        };
      }),
      next: nextPage(result),
    };
  }

  async insert(playlistId: string, videoId: string): Promise<string> {
    const raw = await this.request("playlistItems", { part: "snippet" }, "POST", {
      snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
    });
    try {
      const result = object(raw);
      const snippet = result["snippet"] === undefined ? null : object(result["snippet"]);
      if (snippet?.["playlistId"] !== undefined && snippet["playlistId"] !== playlistId)
        throw new Error("mismatched_receipt");
      if (snippet?.["resourceId"] !== undefined) {
        const resource = object(snippet["resourceId"]);
        if (
          resource["videoId"] !== videoId ||
          (resource["kind"] !== undefined && resource["kind"] !== "youtube#video")
        )
          throw new Error("mismatched_receipt");
      }
      return validatedItemId(result["id"]);
    } catch {
      throw new YouTubeError("invalid_insert_receipt", true, true);
    }
  }

  async remove(itemId: string): Promise<void> {
    try {
      await this.request("playlistItems", { id: itemId }, "DELETE");
    } catch (error) {
      if (error instanceof YouTubeError && error.status === 404) return;
      throw error;
    }
  }

  async uploads(channelId: string): Promise<string> {
    const rows = items(await this.request("channels", { part: "contentDetails", id: channelId }));
    if (rows.length !== 1 || object(rows[0])["id"] !== channelId) {
      throw new YouTubeError("channel_unavailable");
    }
    const related = object(object(object(rows[0])["contentDetails"])["relatedPlaylists"]);
    const id = text(related["uploads"], 100);
    if (!playlistIdPattern.test(id)) throw new YouTubeError("invalid_provider_response", true);
    return id;
  }
}
