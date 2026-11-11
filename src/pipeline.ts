import { HttpError, randomToken } from "./util.ts";
import type { Category, CategoryId, Decision, VideoRow } from "./model.ts";
import { classify } from "./rules.ts";
import {
  acquireLease,
  releaseLease,
  getSettings,
  getRules,
  getCategories,
  audit,
} from "./store.ts";
import {
  YouTube,
  YouTubeError,
  playlistIdPattern,
  type Fetcher,
  type Playlist,
} from "./youtube.ts";
import { renewSubscriptions } from "./websub.ts";
import { refreshMetadata } from "./maintenance.ts";

interface Entry {
  user_id: string;
  video_id: string;
  category_id: string;
  playlist_id: string;
  item_id: string;
}
interface Operation extends Entry {
  kind: "insert" | "delete";
  state: "intent" | "uncertain" | "done";
  created_at: number;
  updated_at: number;
}
interface SyncState {
  sync_cursor: string | null;
  sync_generation: number;
  sync_in_progress: number;
  last_sync_at: number | null;
}
const leaseName = (userId: string): string => `${userId}:pipeline`;
const day = 86400000;

function errorCode(error: unknown): string {
  return error instanceof YouTubeError || error instanceof HttpError
    ? error.code
    : "processing_failed";
}
const needsReconnect = (code: string): boolean =>
  code === "reconnect_required" || code === "connection_required" || code === "token_unreadable";

async function locked<T>(env: Env, userId: string, run: (owner: string) => Promise<T>): Promise<T> {
  const name = leaseName(userId);
  const owner = await acquireLease(env.DB, name, 120000);
  if (!owner) throw new YouTubeError("pipeline_busy", true);
  try {
    return await run(owner);
  } finally {
    await releaseLease(env.DB, name, owner);
  }
}

async function ownerChannel(env: Env, userId: string): Promise<string> {
  const connection = await env.DB.prepare(
    "SELECT channel_id FROM connection WHERE user_id=? AND reconnect_required=0",
  )
    .bind(userId)
    .first<{ channel_id: string }>();
  if (!connection) throw new YouTubeError("connection_required");
  return connection.channel_id;
}

function checkPlaylist(playlist: Playlist, owner: string): void {
  if (playlist.channelId !== owner || playlist.privacy !== "private")
    throw new YouTubeError("playlist_must_be_owned_and_private");
}

async function category(env: Env, userId: string, id: string): Promise<Category> {
  const result = (await getCategories(env.DB, userId)).find((candidate) => candidate.id === id);
  if (!result) throw new YouTubeError("category_not_found");
  return result;
}

export async function attachPlaylist(
  env: Env,
  userId: string,
  categoryId: CategoryId,
  playlistId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (!playlistIdPattern.test(playlistId)) throw new YouTubeError("invalid_playlist_id");
  await locked(env, userId, async (leaseOwner) => {
    const target = await category(env, userId, categoryId);
    if (target.playlistId && target.playlistId !== playlistId)
      throw new YouTubeError("playlist_migration_required");
    const api = new YouTube(env, userId, fetcher, Date.now() + 85000, leaseOwner);
    checkPlaylist(await api.getPlaylist(playlistId), await ownerChannel(env, userId));
    await env.DB.prepare(
      "UPDATE categories SET playlist_id=?,playlist_state='ready',last_error=NULL WHERE user_id=? AND id=?",
    )
      .bind(playlistId, userId, categoryId)
      .run();
    await audit(env.DB, userId, null, "playlist_attached", categoryId);
  });
}

export async function ensurePlaylist(
  env: Env,
  userId: string,
  categoryId: CategoryId,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await locked(env, userId, async (leaseOwner) => {
    const target = await category(env, userId, categoryId);
    const api = new YouTube(env, userId, fetcher, Date.now() + 85000, leaseOwner);
    const owner = await ownerChannel(env, userId);
    if (target.playlistId) {
      checkPlaylist(await api.getPlaylist(target.playlistId), owner);
      await env.DB.prepare(
        "UPDATE categories SET playlist_state='ready',last_error=NULL WHERE user_id=? AND id=?",
      )
        .bind(userId, categoryId)
        .run();
      return;
    }
    const marker = `[suguri:${userId}:${categoryId}]`;
    let cursor: string | null = null;
    let found: Playlist | null = null;
    let complete = false;
    for (let page = 0; page < 10; page++) {
      // oxlint-disable-next-line no-await-in-loop -- Paginate before attempting any possibly duplicate creation.
      const result = await api.ownedPlaylists(cursor);
      for (const candidate of result.playlists) {
        if (!candidate.description.split("\n").includes(marker)) continue;
        checkPlaylist(candidate, owner);
        if (found && found.id !== candidate.id)
          throw new YouTubeError("multiple_managed_playlists");
        found = candidate;
      }
      cursor = result.next;
      if (!cursor) {
        complete = true;
        break;
      }
    }
    if (found) {
      await env.DB.prepare(
        "UPDATE categories SET playlist_id=?,playlist_state='ready',last_error=NULL WHERE user_id=? AND id=?",
      )
        .bind(found.id, userId, categoryId)
        .run();
      return;
    }
    if (!complete) throw new YouTubeError("playlist_reconciliation_incomplete", true);
    if (target.playlistState === "uncertain")
      throw new YouTubeError("playlist_creation_uncertain_attach_manually");
    await env.DB.prepare(
      "UPDATE categories SET playlist_state='uncertain',last_error='playlist_creation_uncertain' WHERE user_id=? AND id=?",
    )
      .bind(userId, categoryId)
      .run();
    try {
      const created = await api.createPlaylist(target.name, marker);
      checkPlaylist(created, owner);
      await env.DB.prepare(
        "UPDATE categories SET playlist_id=?,playlist_state='ready',last_error=NULL WHERE user_id=? AND id=?",
      )
        .bind(created.id, userId, categoryId)
        .run();
      await audit(env.DB, userId, null, "playlist_created", categoryId);
    } catch (error) {
      // Keep the preflight intent if the process dies or the provider response is ambiguous.
      if (
        error instanceof YouTubeError &&
        !error.ambiguous &&
        error.status >= 400 &&
        error.status < 500
      ) {
        await env.DB.prepare(
          "UPDATE categories SET playlist_state='unconfigured',last_error=? WHERE user_id=? AND id=?",
        )
          .bind(error.code, userId, categoryId)
          .run();
      }
      throw error;
    }
  });
}

export async function requestSync(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("UPDATE settings SET last_sync_at=NULL WHERE user_id=?").bind(userId).run();
}

export async function retryUncertain(
  env: Env,
  userId: string,
  videoId: string,
  version: number,
  confirmation: unknown,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (confirmation !== "checked_playlist_absent") throw new HttpError(400, "confirmation_required");
  if (!Number.isSafeInteger(version) || version < 0) throw new HttpError(400, "invalid_version");
  await locked(env, userId, async (leaseOwner) => {
    const row = await env.DB.prepare("SELECT * FROM videos WHERE user_id=? AND id=?")
      .bind(userId, videoId)
      .first<VideoRow>();
    if (!row) throw new HttpError(404, "not_found");
    if (row.version !== version) throw new HttpError(409, "stale");
    const unresolved = await env.DB.prepare(
      "SELECT * FROM operations WHERE user_id=? AND video_id=? AND kind='insert' AND state<>'done'",
    )
      .bind(userId, videoId)
      .all<Operation>();
    if (!unresolved.results.length) throw new HttpError(409, "no_uncertain_insert");
    const api = new YouTube(env, userId, fetcher, Date.now() + 85000, leaseOwner);
    const owner = await ownerChannel(env, userId);
    const statements: D1PreparedStatement[] = [];
    for (const op of unresolved.results) {
      // oxlint-disable-next-line no-await-in-loop -- Validate every destination before changing any saved intent.
      await verifyDestination(api, op.playlist_id, owner);
      // oxlint-disable-next-line no-await-in-loop -- A fresh authoritative list is required even after explicit confirmation.
      const current = await api.playlistItems(op.playlist_id, videoId);
      if (current.next || current.entries.length > 1)
        throw new HttpError(409, "playlist_reconciliation_ambiguous");
      const item = current.entries[0];
      if (item) {
        statements.push(
          env.DB.prepare(`INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)
            ON CONFLICT(user_id,video_id,category_id) DO UPDATE SET playlist_id=excluded.playlist_id,item_id=excluded.item_id`).bind(
            userId,
            videoId,
            op.category_id,
            op.playlist_id,
            item.id,
          ),
          env.DB.prepare(
            "UPDATE operations SET state='done',item_id=?,updated_at=? WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert'",
          ).bind(item.id, Date.now(), userId, videoId, op.category_id),
        );
      } else {
        statements.push(
          env.DB.prepare(
            "DELETE FROM operations WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert' AND state<>'done'",
          ).bind(userId, videoId, op.category_id),
        );
      }
    }
    const status = row.manual_override
      ? row.reason === "manual:exclude" || row.status === "excluded"
        ? "excluded"
        : row.category_id
          ? "queued"
          : "review"
      : "pending";
    statements.push(
      env.DB.prepare(
        "UPDATE videos SET status=?,attempts=0,last_error=NULL,next_attempt_at=0,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
      ).bind(status, Date.now(), userId, videoId, version),
    );
    await env.DB.batch(statements);
    await audit(
      env.DB,
      userId,
      videoId,
      "uncertain_insert_reviewed",
      "Owner explicitly confirmed checking the destination playlist.",
    );
  });
}

async function syncSubscriptions(env: Env, userId: string, api: YouTube): Promise<void> {
  let state = await env.DB.prepare(
    "SELECT sync_cursor,sync_generation,sync_in_progress,last_sync_at FROM settings WHERE user_id=?",
  )
    .bind(userId)
    .first<SyncState>();
  if (
    !state ||
    (!state.sync_in_progress &&
      state.last_sync_at !== null &&
      state.last_sync_at > Date.now() - day)
  )
    return;
  if (!state.sync_in_progress) {
    await env.DB.prepare(
      "UPDATE settings SET sync_in_progress=1,sync_cursor=NULL,sync_generation=sync_generation+1 WHERE user_id=?",
    )
      .bind(userId)
      .run();
    state = {
      ...state,
      sync_in_progress: 1,
      sync_cursor: null,
      sync_generation: state.sync_generation + 1,
    };
  }
  const result = await api.subscriptions(state.sync_cursor);
  const now = Date.now();
  const statements = result.channels.map((channel) =>
    env.DB.prepare(`INSERT INTO channels(user_id,id,title,sync_generation,callback_token,hub_secret)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,active=1,sync_generation=excluded.sync_generation`).bind(
      userId,
      channel.id,
      channel.title,
      state.sync_generation,
      randomToken(),
      randomToken(),
    ),
  );
  if (result.next)
    statements.push(
      env.DB.prepare("UPDATE settings SET sync_cursor=? WHERE user_id=?").bind(result.next, userId),
    );
  else {
    statements.push(
      env.DB.prepare(
        "UPDATE channels SET active=0,renew_after=0 WHERE user_id=? AND sync_generation<>?",
      ).bind(userId, state.sync_generation),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE settings SET sync_in_progress=0,sync_cursor=NULL,last_sync_at=? WHERE user_id=?",
      ).bind(now, userId),
    );
  }
  await env.DB.batch(statements);
}

async function enqueue(
  env: Env,
  userId: string,
  ids: { id: string; channelId: string }[],
): Promise<void> {
  const now = Date.now();
  if (ids.length)
    await env.DB.batch(
      ids.map((video) =>
        env.DB.prepare(`INSERT INTO videos(user_id,id,channel_id,discovered_at,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO NOTHING`).bind(
          userId,
          video.id,
          video.channelId,
          now,
          now,
        ),
      ),
    );
}

async function reconcileUploads(env: Env, userId: string, api: YouTube): Promise<void> {
  const settings = await getSettings(env.DB, userId);
  const cutoff = Date.now() - settings.backfillDays * day;
  const rows =
    await env.DB.prepare(`SELECT id,reconcile_cursor FROM channels WHERE user_id=? AND active=1
    AND (reconcile_cursor IS NOT NULL OR last_reconciled_at<?) ORDER BY last_reconciled_at,id LIMIT 2`)
      .bind(userId, Date.now() - 6 * 3600000)
      .all<{ id: string; reconcile_cursor: string | null }>();
  for (const channel of rows.results) {
    let progress: { uploads: string; page: string | null };
    if (channel.reconcile_cursor) {
      try {
        progress = JSON.parse(channel.reconcile_cursor) as { uploads: string; page: string | null };
      } catch {
        throw new YouTubeError("invalid_reconcile_cursor");
      }
      if (
        !playlistIdPattern.test(progress.uploads) ||
        (progress.page !== null && typeof progress.page !== "string")
      )
        throw new YouTubeError("invalid_reconcile_cursor");
    } else {
      // oxlint-disable-next-line no-await-in-loop -- Resolve the actual uploads playlist instead of deriving its ID.
      progress = { uploads: await api.uploads(channel.id), page: null };
    }
    // oxlint-disable-next-line no-await-in-loop -- Each channel advances one durable page per tick.
    const result = await api.playlistItems(progress.uploads, undefined, progress.page ?? undefined);
    // oxlint-disable-next-line no-await-in-loop -- Persist discovered IDs before advancing the cursor.
    await enqueue(
      env,
      userId,
      result.entries
        .filter((entry) => !entry.publishedAt || Date.parse(entry.publishedAt) >= cutoff)
        .map((entry) => ({ id: entry.videoId, channelId: channel.id })),
    );
    const reachedCutoff = result.entries.some(
      (entry) => entry.publishedAt && Date.parse(entry.publishedAt) < cutoff,
    );
    const next =
      result.next && !reachedCutoff
        ? JSON.stringify({ uploads: progress.uploads, page: result.next })
        : null;
    // oxlint-disable-next-line no-await-in-loop -- Commit only the successfully consumed page.
    await env.DB.prepare(
      "UPDATE channels SET reconcile_cursor=?,last_reconciled_at=?,last_error=NULL WHERE user_id=? AND id=?",
    )
      .bind(next, Date.now(), userId, channel.id)
      .run();
  }
}

async function pollSeries(env: Env, userId: string, api: YouTube): Promise<void> {
  const settings = await getSettings(env.DB, userId);
  const cutoff = Date.now() - settings.backfillDays * day;
  const rows = await env.DB.prepare(`SELECT id,playlist_id,cursor FROM series WHERE user_id=?
    AND (cursor IS NOT NULL OR last_checked_at<?) ORDER BY last_checked_at,id LIMIT 1`)
    .bind(userId, Date.now() - 3600000)
    .all<{ id: string; playlist_id: string; cursor: string | null }>();
  for (const series of rows.results) {
    // oxlint-disable-next-line no-await-in-loop -- Persist one series page per tick.
    const result = await api.playlistItems(
      series.playlist_id,
      undefined,
      series.cursor ?? undefined,
    );
    const now = Date.now();
    const statements = result.entries.flatMap((entry) => [
      env.DB.prepare(
        "INSERT INTO series_videos(user_id,series_id,video_id) VALUES(?,?,?) ON CONFLICT DO NOTHING",
      ).bind(userId, series.id, entry.videoId),
      env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,discovered_at,updated_at) SELECT ?,?,'',?,? WHERE ?>=? ON CONFLICT(user_id,id) DO NOTHING",
      ).bind(
        userId,
        entry.videoId,
        now,
        now,
        Number.isFinite(Date.parse(entry.publishedAt)) ? Date.parse(entry.publishedAt) : 0,
        cutoff,
      ),
      env.DB.prepare(
        "UPDATE videos SET status='pending',next_attempt_at=0 WHERE user_id=? AND id=? AND manual_override=0 AND status IN ('review','excluded') AND published_at>=?",
      ).bind(userId, entry.videoId, new Date(cutoff).toISOString()),
    ]);
    statements.push(
      env.DB.prepare("UPDATE series SET cursor=?,last_checked_at=? WHERE user_id=? AND id=?").bind(
        result.next,
        now,
        userId,
        series.id,
      ),
    );
    // oxlint-disable-next-line no-await-in-loop -- Page membership is durable before the cursor advances.
    await env.DB.batch(statements);
  }
}

async function seriesDecision(env: Env, userId: string, id: string): Promise<Decision | null> {
  const memberships =
    await env.DB.prepare(`SELECT s.mode,s.category_id FROM series s JOIN series_videos v
    ON s.user_id=v.user_id AND s.id=v.series_id WHERE s.user_id=? AND v.video_id=? ORDER BY s.id`)
      .bind(userId, id)
      .all<{ mode: "hold" | "follow"; category_id: string | null }>();
  if (memberships.results.some((row) => row.mode === "hold"))
    return { status: "review", categoryId: null, reason: "series_hold" };
  const follow = memberships.results.find((row) => row.mode === "follow" && row.category_id);
  return follow
    ? { status: "queued", categoryId: follow.category_id, reason: "series_follow" }
    : null;
}

async function recordEntry(env: Env, op: Operation, itemId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO playlist_entries(user_id,video_id,category_id,playlist_id,item_id) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id,video_id,category_id) DO UPDATE SET playlist_id=excluded.playlist_id,item_id=excluded.item_id`).bind(
      op.user_id,
      op.video_id,
      op.category_id,
      op.playlist_id,
      itemId,
    ),
    env.DB.prepare(
      "UPDATE operations SET state='done',item_id=?,updated_at=? WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert'",
    ).bind(itemId, Date.now(), op.user_id, op.video_id, op.category_id),
    env.DB.prepare(
      "UPDATE videos SET attempts=0,next_attempt_at=0,last_error=NULL,status=CASE WHEN status IN ('removed','excluded') THEN status WHEN manual_override=1 AND reason='manual:exclude' THEN 'excluded' WHEN manual_override=1 AND category_id IS NOT NULL THEN 'queued' WHEN status='error' THEN CASE WHEN category_id IS NOT NULL THEN 'queued' ELSE 'pending' END ELSE status END WHERE user_id=? AND id=?",
    ).bind(op.user_id, op.video_id),
  ]);
}

async function resolveInsert(env: Env, api: YouTube, op: Operation): Promise<boolean> {
  const result = await api.playlistItems(op.playlist_id, op.video_id);
  if (result.entries.length === 1 && !result.next) {
    await recordEntry(env, op, result.entries[0]?.id ?? "");
    return true;
  }
  await env.DB.prepare(
    "UPDATE operations SET state='uncertain',updated_at=? WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert'",
  )
    .bind(Date.now(), op.user_id, op.video_id, op.category_id)
    .run();
  return false;
}

async function reconcileUncertain(env: Env, userId: string, api: YouTube): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT * FROM operations WHERE user_id=? AND kind='insert' AND state<>'done' ORDER BY updated_at LIMIT 3",
  )
    .bind(userId)
    .all<Operation>();
  for (const op of rows.results) {
    // oxlint-disable-next-line no-await-in-loop -- Reconcile prior intents before any new insertion for that video.
    const resolved = await resolveInsert(env, api, op);
    if (!resolved) {
      // oxlint-disable-next-line no-await-in-loop -- Absence is not proof that a timed-out insertion did not commit.
      await env.DB.prepare(
        "UPDATE videos SET last_error='playlist_insert_uncertain',next_attempt_at=? WHERE user_id=? AND id=?",
      )
        .bind(Date.now() + 3600000, userId, op.video_id)
        .run();
    }
  }
}

async function verifyDestination(api: YouTube, playlistId: string, owner: string): Promise<void> {
  checkPlaylist(await api.getPlaylist(playlistId), owner);
}

async function deleteEntry(
  env: Env,
  userId: string,
  entry: Entry,
  api: YouTube,
  owner: string,
): Promise<void> {
  await verifyDestination(api, entry.playlist_id, owner);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,item_id,created_at,updated_at)
    VALUES(?,?,?,?,'delete','intent',?,?,?) ON CONFLICT(user_id,video_id,category_id,kind)
    DO UPDATE SET state='intent',item_id=excluded.item_id,updated_at=excluded.updated_at`)
    .bind(userId, entry.video_id, entry.category_id, entry.playlist_id, entry.item_id, now, now)
    .run();
  // An idempotent delete of an exact ledger item is safe after a lost response; 404 completes it.
  await api.remove(entry.item_id);
  await finishDeletion(env, userId, entry);
}

async function finishDeletion(env: Env, userId: string, entry: Entry): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM playlist_entries WHERE user_id=? AND video_id=? AND category_id=? AND item_id=?",
    ).bind(userId, entry.video_id, entry.category_id, entry.item_id),
    env.DB.prepare(
      "UPDATE operations SET state='done',updated_at=? WHERE user_id=? AND video_id=? AND category_id=? AND kind='delete'",
    ).bind(Date.now(), userId, entry.video_id, entry.category_id),
    env.DB.prepare(
      "DELETE FROM operations WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert' AND state='done'",
    ).bind(userId, entry.video_id, entry.category_id),
  ]);
}

async function membership(
  env: Env,
  userId: string,
  row: VideoRow,
  api: YouTube,
  owner: string,
): Promise<void> {
  const unresolved = await env.DB.prepare(
    "SELECT 1 AS present FROM operations WHERE user_id=? AND video_id=? AND kind='insert' AND state<>'done' LIMIT 1",
  )
    .bind(userId, row.id)
    .first();
  if (unresolved) throw new YouTubeError("playlist_insert_uncertain");
  const entries = (
    await env.DB.prepare("SELECT * FROM playlist_entries WHERE user_id=? AND video_id=?")
      .bind(userId, row.id)
      .all<Entry>()
  ).results;
  if (row.status === "excluded") {
    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop -- Delete only exact items recorded by this user's ledger.
      await deleteEntry(env, userId, entry, api, owner);
    }
    await env.DB.prepare(
      "UPDATE videos SET status='excluded',last_error=NULL,attempts=0,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
    )
      .bind(Date.now(), userId, row.id, row.version)
      .run();
    return;
  }
  if (row.status !== "queued" || !row.category_id) return;
  const target = await category(env, userId, row.category_id);
  if (!target.playlistId || target.playlistState !== "ready")
    throw new YouTubeError("category_playlist_unconfigured");
  await verifyDestination(api, target.playlistId, owner);
  const entry = entries.find((candidate) => candidate.category_id === row.category_id);
  if (!entry) {
    // A failed read proves no insert was attempted; it must not leave a write intent.
    const existing = await api.playlistItems(target.playlistId, row.id);
    if (existing.entries.length > 1 || existing.next)
      throw new YouTubeError("multiple_playlist_entries");
    const now = Date.now();
    const op: Operation = {
      user_id: userId,
      video_id: row.id,
      category_id: row.category_id,
      playlist_id: target.playlistId,
      item_id: "",
      kind: "insert",
      state: "intent",
      created_at: now,
      updated_at: now,
    };
    const inserted =
      await env.DB.prepare(`INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at)
      VALUES(?,?,?,?,'insert','intent',?,?) ON CONFLICT DO NOTHING`)
        .bind(userId, row.id, row.category_id, target.playlistId, now, now)
        .run();
    if (!inserted.meta.changes) {
      if (!(await resolveInsert(env, api, op))) throw new YouTubeError("playlist_insert_uncertain");
    } else {
      try {
        const current = await env.DB.prepare("SELECT version FROM videos WHERE user_id=? AND id=?")
          .bind(userId, row.id)
          .first<{ version: number }>();
        if (current?.version !== row.version) throw new YouTubeError("video_changed");
        const itemId = existing.entries[0]?.id ?? (await api.insert(target.playlistId, row.id));
        await recordEntry(env, op, itemId);
      } catch (error) {
        if (error instanceof YouTubeError && !error.ambiguous) {
          await env.DB.prepare(
            "DELETE FROM operations WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert' AND state='intent'",
          )
            .bind(userId, row.id, row.category_id)
            .run();
        } else {
          await env.DB.prepare(
            "UPDATE operations SET state='uncertain',updated_at=? WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert'",
          )
            .bind(Date.now(), userId, row.id, row.category_id)
            .run();
        }
        throw error;
      }
    }
  }
  // Destination is durable before any old managed entry is removed.
  for (const previous of entries.filter((candidate) => candidate.category_id !== row.category_id)) {
    // oxlint-disable-next-line no-await-in-loop -- Preserve add-before-remove ordering for category moves.
    await deleteEntry(env, userId, previous, api, owner);
  }
  await env.DB.prepare(
    "UPDATE videos SET status='added',last_error=NULL,attempts=0,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
  )
    .bind(Date.now(), userId, row.id, row.version)
    .run();
}

async function reconcileDeletes(
  env: Env,
  userId: string,
  api: YouTube,
  owner: string,
): Promise<void> {
  const settings = await getSettings(env.DB, userId);
  const rows =
    await env.DB.prepare(`SELECT o.*,v.attempts,v.next_attempt_at FROM operations o JOIN videos v ON v.user_id=o.user_id AND v.id=o.video_id
    WHERE o.user_id=? AND o.kind='delete' AND o.state<>'done' AND (? OR v.manual_override=1) ORDER BY o.updated_at LIMIT 3`)
      .bind(userId, Number(settings.enabled))
      .all<Operation & { attempts: number; next_attempt_at: number }>();
  for (const op of rows.results) {
    if (!op.item_id) throw new YouTubeError("invalid_delete_intent");
    try {
      // oxlint-disable-next-line no-await-in-loop -- A fresh scoped read can settle a lost delete without another write.
      const current = await api.playlistItems(op.playlist_id, op.video_id);
      if (current.next) throw new YouTubeError("delete_reconciliation_incomplete", true);
      if (!current.entries.some((entry) => entry.id === op.item_id)) {
        // oxlint-disable-next-line no-await-in-loop -- The recorded item is confirmed absent; finish only local bookkeeping.
        await finishDeletion(env, userId, op);
      } else {
        if (op.attempts >= 6 || op.next_attempt_at > Date.now()) continue;
        // oxlint-disable-next-line no-await-in-loop -- Retry only a due exact deletion target within its bounded allowance.
        await deleteEntry(env, userId, op, api, owner);
      }
    } catch (error) {
      const code = errorCode(error);
      if (needsReconnect(code)) throw error;
      const quota =
        code.includes("quota_exhausted") ||
        code === "tick_budget_exhausted" ||
        code === "pipeline_lease_lost";
      const attempts = quota ? op.attempts : Math.min(6, op.attempts + 1);
      const terminal =
        !quota && (attempts >= 6 || (error instanceof YouTubeError && !error.retryable));
      // oxlint-disable-next-line no-await-in-loop -- Maintenance retries share the same durable per-video retry budget.
      await env.DB.prepare(
        "UPDATE videos SET last_error=?,attempts=?,next_attempt_at=?,status=CASE WHEN ? THEN 'error' ELSE status END WHERE user_id=? AND id=?",
      )
        .bind(
          code,
          terminal ? 6 : attempts,
          Date.now() + (quota ? 3600000 : Math.min(day, 60000 * 2 ** attempts)),
          Number(terminal),
          userId,
          op.video_id,
        )
        .run();
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Completing a move must restore work stopped at the retry limit.
    await env.DB.prepare(
      "UPDATE videos SET attempts=0,last_error=NULL,next_attempt_at=0,status=CASE WHEN status='error' THEN CASE WHEN manual_override=1 AND reason='manual:exclude' THEN 'excluded' WHEN category_id IS NOT NULL THEN 'queued' ELSE 'pending' END ELSE status END WHERE user_id=? AND id=?",
    )
      .bind(userId, op.video_id)
      .run();
  }
}

async function detectRemoved(env: Env, userId: string, api: YouTube): Promise<void> {
  const rows =
    await env.DB.prepare(`SELECT e.* FROM playlist_entries e JOIN videos v ON v.user_id=e.user_id AND v.id=e.video_id
    WHERE e.user_id=? AND v.status='added' AND v.next_attempt_at<=? AND NOT EXISTS(
      SELECT 1 FROM operations o WHERE o.user_id=e.user_id AND o.video_id=e.video_id AND o.category_id=e.category_id
      AND o.kind='delete' AND o.state<>'done' AND o.item_id=e.item_id) ORDER BY v.next_attempt_at LIMIT 2`)
      .bind(userId, Date.now())
      .all<Entry>();
  for (const entry of rows.results) {
    // oxlint-disable-next-line no-await-in-loop -- A successful scoped list distinguishes removals from provider errors.
    const result = await api.playlistItems(entry.playlist_id, entry.video_id);
    const exists = result.entries.some((candidate) => candidate.id === entry.item_id);
    if (!exists && !result.next) {
      // oxlint-disable-next-line no-await-in-loop -- External removals become sticky manual decisions.
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE videos SET status='removed',manual_override=1,reason='removed_externally',last_error=NULL,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND status<>'excluded'",
        ).bind(Date.now(), userId, entry.video_id),
        env.DB.prepare(
          "DELETE FROM playlist_entries WHERE user_id=? AND video_id=? AND category_id=? AND item_id=?",
        ).bind(userId, entry.video_id, entry.category_id, entry.item_id),
        env.DB.prepare(
          "DELETE FROM operations WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert' AND state='done'",
        ).bind(userId, entry.video_id, entry.category_id),
      ]);
    } else {
      // oxlint-disable-next-line no-await-in-loop -- Spread periodic checks across the stored added set.
      await env.DB.prepare("UPDATE videos SET next_attempt_at=? WHERE user_id=? AND id=?")
        .bind(Date.now() + 6 * 3600000, userId, entry.video_id)
        .run();
    }
  }
}

async function processVideo(
  env: Env,
  userId: string,
  row: VideoRow,
  api: YouTube,
  owner: string,
): Promise<void> {
  if (row.manual_override && row.reason === "manual:exclude") row = { ...row, status: "excluded" };
  if (!row.manual_override && row.status !== "excluded") {
    const tracked = await env.DB.prepare(
      `SELECT e.* FROM playlist_entries e WHERE e.user_id=? AND e.video_id=? AND NOT EXISTS(
        SELECT 1 FROM operations o WHERE o.user_id=e.user_id AND o.video_id=e.video_id AND o.category_id=e.category_id
        AND o.kind='delete' AND o.state<>'done' AND o.item_id=e.item_id)`,
    )
      .bind(userId, row.id)
      .all<Entry>();
    for (const entry of tracked.results) {
      // oxlint-disable-next-line no-await-in-loop -- Check every old membership before rule re-evaluation can move it.
      const current = await api.playlistItems(entry.playlist_id, entry.video_id);
      if (!current.next && !current.entries.some((item) => item.id === entry.item_id)) {
        // oxlint-disable-next-line no-await-in-loop -- A remote removal is sticky before any new destination is considered.
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE videos SET status='removed',manual_override=1,reason='removed_externally',updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
          ).bind(Date.now(), userId, row.id, row.version),
          env.DB.prepare(
            "DELETE FROM playlist_entries WHERE user_id=? AND video_id=? AND category_id=? AND item_id=?",
          ).bind(userId, row.id, entry.category_id, entry.item_id),
          env.DB.prepare(
            "DELETE FROM operations WHERE user_id=? AND video_id=? AND category_id=? AND kind='insert' AND state='done'",
          ).bind(userId, row.id, entry.category_id),
        ]);
        return;
      }
    }
  }
  if (
    row.status !== "excluded" &&
    (row.status === "pending" ||
      row.status === "deferred" ||
      row.status === "error" ||
      row.status === "unavailable" ||
      row.duration_seconds === null)
  ) {
    const metadata = await api.video(row.id);
    if (!metadata) {
      await env.DB.prepare(
        "UPDATE videos SET status='unavailable',last_error='video_unavailable',channel_title='',title='',description='',thumbnail_url='',duration_seconds=NULL,metadata_fetched_at=?,metadata_dirty=0,next_attempt_at=?,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
      )
        .bind(Date.now(), Date.now() + day, Date.now(), userId, row.id, row.version)
        .run();
      return;
    }
    const settings = await getSettings(env.DB, userId);
    let decision: Decision;
    if (row.manual_override) {
      decision = {
        status: row.category_id ? "queued" : "review",
        categoryId: row.category_id,
        reason: row.reason,
      };
    } else if (Date.parse(metadata.publishedAt) < Date.now() - settings.backfillDays * day) {
      decision = { status: "review", categoryId: null, reason: "outside_backfill_window" };
    } else
      decision =
        (await seriesDecision(env, userId, row.id)) ??
        classify(metadata, await getRules(env.DB, userId));
    if (metadata.liveState !== "none" && !metadata.endedAt && decision.status !== "excluded") {
      decision = {
        status: "deferred",
        categoryId: row.manual_override ? row.category_id : null,
        reason: "awaiting_end",
      };
    }
    const now = Date.now();
    const updated =
      await env.DB.prepare(`UPDATE videos SET channel_id=?,channel_title=?,title=?,description=?,published_at=?,duration_seconds=?,
      live_state=?,ended_at=?,thumbnail_url=?,metadata_fetched_at=?,metadata_dirty=0,status=?,category_id=?,reason=?,last_error=NULL,next_attempt_at=?,updated_at=?,version=version+1
      WHERE user_id=? AND id=? AND version=?`)
        .bind(
          metadata.channelId,
          metadata.channelTitle,
          metadata.title,
          metadata.description,
          metadata.publishedAt,
          metadata.durationSeconds,
          metadata.liveState,
          metadata.endedAt,
          metadata.thumbnailUrl,
          now,
          decision.status,
          decision.categoryId,
          decision.reason,
          decision.status === "deferred" ? now + 1800000 : 0,
          now,
          userId,
          row.id,
          row.version,
        )
        .run();
    if (!updated.meta.changes) return;
    const current = await env.DB.prepare("SELECT * FROM videos WHERE user_id=? AND id=?")
      .bind(userId, row.id)
      .first<VideoRow>();
    if (!current) return;
    row = current;
  }
  if (row.status === "queued" && row.live_state !== "none" && !row.ended_at) {
    await env.DB.prepare(
      "UPDATE videos SET status='deferred',reason='awaiting_end',next_attempt_at=?,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
    )
      .bind(Date.now() + 1800000, Date.now(), userId, row.id, row.version)
      .run();
    return;
  }
  const settings = await getSettings(env.DB, userId);
  if (
    (row.status === "queued" || row.status === "excluded") &&
    !settings.enabled &&
    !row.manual_override
  )
    return;
  await membership(env, userId, row, api, owner);
}

export async function runPipeline(
  env: Env,
  userId: string,
  fetcher: Fetcher = fetch,
): Promise<{ processed: number }> {
  return locked(env, userId, async (leaseOwner) => {
    const deadline = Date.now() + 85000;
    const api = new YouTube(env, userId, fetcher, deadline, leaseOwner);
    const owner = await ownerChannel(env, userId);
    let processed = 0;
    let lastError: string | null = null;
    const maintenance = [
      () => reconcileDeletes(env, userId, api, owner),
      () => reconcileUncertain(env, userId, api),
      () => syncSubscriptions(env, userId, api),
      () => pollSeries(env, userId, api),
      () => reconcileUploads(env, userId, api),
      () => detectRemoved(env, userId, api),
      () => refreshMetadata(env, userId, api),
    ];
    for (const task of maintenance) {
      if (Date.now() + 16000 > deadline) break;
      try {
        // oxlint-disable-next-line no-await-in-loop -- All provider work is serialized under the user's lease.
        await task();
      } catch (error) {
        lastError = errorCode(error);
        if (needsReconnect(lastError)) {
          // oxlint-disable-next-line no-await-in-loop -- Persist the connection failure before ending this user's pass.
          await env.DB.prepare("UPDATE settings SET last_run_at=?,last_error=? WHERE user_id=?")
            .bind(Date.now(), lastError, userId)
            .run();
          return { processed };
        }
      }
    }
    if (Date.now() + 20000 < deadline) await renewSubscriptions(env, userId, fetcher);
    const rows =
      await env.DB.prepare(`SELECT * FROM videos v WHERE user_id=? AND next_attempt_at<=? AND attempts<6
      AND (status IN ('pending','deferred','error','queued','unavailable') OR (status='excluded' AND EXISTS(
        SELECT 1 FROM playlist_entries e WHERE e.user_id=v.user_id AND e.video_id=v.id)))
      ORDER BY manual_override DESC,discovered_at,id LIMIT 8`)
        .bind(userId, Date.now())
        .all<VideoRow>();
    for (const row of rows.results) {
      if (Date.now() + 16000 > deadline) break;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Serial processing preserves destination ordering and quota bounds.
        await processVideo(env, userId, row, api, owner);
        processed++;
      } catch (error) {
        const code = errorCode(error);
        lastError = code;
        const quota =
          code.includes("quota_exhausted") ||
          code === "tick_budget_exhausted" ||
          code === "pipeline_lease_lost" ||
          needsReconnect(code);
        if (quota) {
          // oxlint-disable-next-line no-await-in-loop -- Exhausted quota postpones work without consuming its retry allowance.
          await env.DB.prepare(
            "UPDATE videos SET last_error=?,next_attempt_at=? WHERE user_id=? AND id=?",
          )
            .bind(code, Date.now() + 3600000, userId, row.id)
            .run();
          if (needsReconnect(code)) break;
          continue;
        }
        const attempts = row.attempts + 1;
        const terminal = attempts >= 6 || (error instanceof YouTubeError && !error.retryable);
        const wait =
          Math.min(day, 60000 * 2 ** Math.min(attempts, 10)) + Math.floor(Math.random() * 30000);
        // oxlint-disable-next-line no-await-in-loop -- Persist bounded retry state while retaining the last known metadata and decision.
        await env.DB.prepare(
          "UPDATE videos SET status=CASE WHEN ? THEN 'error' ELSE status END,last_error=?,attempts=?,next_attempt_at=?,updated_at=? WHERE user_id=? AND id=?",
        )
          .bind(
            Number(terminal),
            code,
            terminal ? 6 : attempts,
            Date.now() + wait,
            Date.now(),
            userId,
            row.id,
          )
          .run();
      }
    }
    await env.DB.prepare("UPDATE settings SET last_run_at=?,last_error=? WHERE user_id=?")
      .bind(Date.now(), lastError, userId)
      .run();
    return { processed };
  });
}
