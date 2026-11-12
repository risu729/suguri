import {
  metadataFromRow,
  type AppState,
  type Category,
  type Principal,
  type Rule,
  type Series,
  type Settings,
  type VideoRow,
} from "./model.ts";
import { HttpError, randomToken } from "./util.ts";

export async function ensureUser(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO users(id,created_at,csrf_token) VALUES(?,?,?)")
      .bind(userId, Date.now(), randomToken()),
    db
      .prepare("INSERT OR IGNORE INTO settings(user_id,discovery_start) VALUES(?,?)")
      .bind(userId, Date.now() - 7 * 86400000),
  ]);
}
export async function getSettings(db: D1Database, userId: string): Promise<Settings> {
  const row = await db.prepare("SELECT * FROM settings WHERE user_id=?").bind(userId).first<{
    enabled: number;
    daily_budget_units: number;
    daily_insert_limit: number;
    discovery_start: number;
    backfill_days: number;
  }>();
  if (!row) throw new HttpError(404, "user_not_found");
  return {
    enabled: !!row.enabled,
    dailyBudgetUnits: row.daily_budget_units,
    dailyInsertLimit: row.daily_insert_limit,
    discoveryStart: row.discovery_start,
    backfillDays: row.backfill_days,
  };
}
export async function getRules(db: D1Database, userId: string): Promise<Rule[]> {
  const rows = await db
    .prepare("SELECT definition FROM rules WHERE user_id=? ORDER BY priority,id")
    .bind(userId)
    .all<{ definition: string }>();
  return rows.results.map((row) => JSON.parse(row.definition) as Rule);
}
export async function getCategories(db: D1Database, userId: string): Promise<Category[]> {
  return (
    await db
      .prepare(
        "SELECT id,name,playlist_id AS playlistId,playlist_state AS playlistState,last_error AS lastError FROM categories WHERE user_id=? ORDER BY name,id",
      )
      .bind(userId)
      .all<Category>()
  ).results;
}
export async function acquireLease(
  db: D1Database,
  name: string,
  ttlMs = 120000,
): Promise<string | null> {
  const owner = randomToken();
  const result = await db
    .prepare(
      "INSERT INTO leases(name,owner,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<?",
    )
    .bind(name, owner, Date.now() + ttlMs, Date.now())
    .run();
  return result.meta.changes ? owner : null;
}
export async function releaseLease(db: D1Database, name: string, owner: string): Promise<void> {
  await db.prepare("DELETE FROM leases WHERE name=? AND owner=?").bind(name, owner).run();
}
export async function withLease<T>(
  db: D1Database,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const name = `${userId}:pipeline`,
    owner = await acquireLease(db, name);
  if (!owner) throw new HttpError(409, "busy");
  try {
    return await work();
  } finally {
    await releaseLease(db, name, owner);
  }
}
export async function audit(
  db: D1Database,
  userId: string,
  videoId: string | null,
  action: string,
  detail: string,
  actor = "system",
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit(user_id,actor,video_id,action,detail,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(userId, actor, videoId, action, detail, Date.now())
    .run();
}
export function quotaDay(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export async function reevaluate(db: D1Database, userId: string, discover = false): Promise<void> {
  const settings = await getSettings(db, userId);
  await db.batch([
    db
      .prepare(
        "UPDATE videos SET needs_classification=1,next_attempt_at=CASE WHEN status='added' AND last_error IS NULL THEN 0 ELSE next_attempt_at END,version=version+1,updated_at=? WHERE user_id=? AND manual_override=0 AND (published_at>=? OR (published_at='' AND discovered_at>=?))",
      )
      .bind(
        Date.now(),
        userId,
        new Date(Date.now() - settings.backfillDays * 86400000).toISOString(),
        Date.now() - settings.backfillDays * 86400000,
      ),
    ...(discover
      ? [
          db
            .prepare(
              "UPDATE channels SET last_reconciled_at=0,reconcile_cursor=NULL WHERE user_id=?",
            )
            .bind(userId),
          db
            .prepare("UPDATE series SET last_checked_at=0,cursor=NULL WHERE user_id=?")
            .bind(userId),
        ]
      : []),
  ]);
}
export async function appState(
  db: D1Database,
  principal: Principal,
  input: Record<string, unknown>,
): Promise<AppState> {
  const uid = principal.userId;
  const clauses = ["user_id=?"],
    values: (string | number)[] = [uid];
  if (typeof input["status"] === "string" && input["status"] !== "all") {
    clauses.push("status=?");
    values.push(input["status"]);
  }
  if (typeof input["category"] === "string" && input["category"]) {
    clauses.push("category_id=?");
    values.push(input["category"]);
  }
  if (typeof input["q"] === "string" && input["q"]) {
    clauses.push("(title LIKE ? OR channel_title LIKE ?)");
    values.push(`%${input["q"].slice(0, 200)}%`, `%${input["q"].slice(0, 200)}%`);
  }
  const offset = Number(input["cursor"] ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
    throw new HttpError(400, "invalid_cursor");
  const rows = (
    await db
      .prepare(
        `SELECT * FROM videos WHERE ${clauses.join(" AND ")} ORDER BY discovered_at DESC,id LIMIT 51 OFFSET ?`,
      )
      .bind(...values, offset)
      .all<VideoRow>()
  ).results;
  const [
    settings,
    categories,
    rules,
    connection,
    user,
    counts,
    quota,
    channels,
    timing,
    series,
    notificationCount,
    notifications,
    collectionErrors,
  ] = await Promise.all([
    getSettings(db, uid),
    getCategories(db, uid),
    getRules(db, uid),
    db
      .prepare(
        "SELECT channel_title,reconnect_required,(length(access_token)>0) AS has_token FROM connection WHERE user_id=?",
      )
      .bind(uid)
      .first<{ channel_title: string; reconnect_required: number; has_token: number }>(),
    db.prepare("SELECT csrf_token FROM users WHERE id=?").bind(uid).first<{ csrf_token: string }>(),
    db
      .prepare("SELECT status,count(*) AS n FROM videos WHERE user_id=? GROUP BY status")
      .bind(uid)
      .all<{ status: string; n: number }>(),
    db
      .prepare("SELECT units,insertions FROM user_quota WHERE user_id=? AND day=?")
      .bind(uid, quotaDay())
      .first<{ units: number; insertions: number }>(),
    db
      .prepare(
        "SELECT count(*) AS total,coalesce(sum(lease_expires_at>?),0) AS activeWebSub,coalesce(sum(last_reconciled_at>0 AND reconcile_cursor IS NULL),0) AS backfillComplete,coalesce(sum(last_error IS NOT NULL),0) AS errors,coalesce(sum(CASE WHEN json_valid(reconcile_cursor) THEN json_extract(reconcile_cursor,'$.error') IS NOT NULL ELSE 0 END),0) AS backfillFailed FROM channels WHERE user_id=? AND active=1",
      )
      .bind(Date.now(), uid)
      .first<AppState["channels"]>(),
    db
      .prepare("SELECT last_sync_at,last_run_at,last_error FROM settings WHERE user_id=?")
      .bind(uid)
      .first<{
        last_sync_at: number | null;
        last_run_at: number | null;
        last_error: string | null;
      }>(),
    db
      .prepare(
        "SELECT id,name,playlist_id AS playlistId,category_id AS categoryId,mode,started_at AS startedAt FROM series WHERE user_id=? ORDER BY name",
      )
      .bind(uid)
      .all<Series>(),
    db
      .prepare(
        "SELECT count(DISTINCT video_id) AS videos,max(created_at) AS lastReceivedAt FROM audit WHERE user_id=? AND action='websub_received' AND actor='websub'",
      )
      .bind(uid)
      .first<{ videos: number; lastReceivedAt: number | null }>(),
    db
      .prepare(`SELECT a.video_id AS videoId,min(a.created_at) AS firstReceivedAt,max(a.created_at) AS lastReceivedAt,
        min(CASE WHEN a.detail='discovered' THEN a.created_at END) AS discoveredFromNotificationAt,
        v.published_at AS publishedAt,v.status,v.manual_override AS manualOverride,
        (SELECT max(o.updated_at) FROM operations o WHERE o.user_id=a.user_id AND o.video_id=a.video_id AND o.kind='insert' AND o.state='done') AS addedAt
        FROM audit a JOIN videos v ON v.user_id=a.user_id AND v.id=a.video_id
        WHERE a.user_id=? AND a.action='websub_received' AND a.actor='websub'
        GROUP BY a.video_id ORDER BY lastReceivedAt DESC,a.video_id LIMIT 20`)
      .bind(uid)
      .all<AppState["notifications"]["recent"][number]>(),
    db
      .prepare(`SELECT id AS channelId,title,json_extract(reconcile_cursor,'$.error') AS code,
      json_extract(reconcile_cursor,'$.retryAt') AS nextAttemptAt FROM channels
      WHERE user_id=? AND active=1 AND CASE WHEN json_valid(reconcile_cursor) THEN json_extract(reconcile_cursor,'$.error') IS NOT NULL ELSE 0 END
      ORDER BY id LIMIT 25`)
      .bind(uid)
      .all<AppState["collectionErrors"][number]>(),
  ]);
  return {
    authenticated: true,
    connected: !!connection?.has_token,
    reconnectRequired: !!connection?.has_token && !!connection.reconnect_required,
    csrfToken: user?.csrf_token ?? "",
    channelTitle: connection?.channel_title ?? null,
    settings,
    categories,
    rules,
    series: series.results,
    videos: rows.slice(0, 50).map((row) => ({
      ...metadataFromRow(row),
      status: row.status,
      categoryId: row.category_id,
      manualOverride: !!row.manual_override,
      needsClassification: !!row.needs_classification,
      reason: row.reason,
      lastError: row.last_error,
      version: row.version,
    })),
    hasMore: rows.length > 50,
    nextCursor: rows.length > 50 ? offset + 50 : null,
    counts: Object.fromEntries(counts.results.map((row) => [row.status, row.n])),
    quota: { day: quotaDay(), units: quota?.units ?? 0, insertions: quota?.insertions ?? 0 },
    channels: channels ?? {
      total: 0,
      activeWebSub: 0,
      backfillComplete: 0,
      errors: 0,
      backfillFailed: 0,
    },
    collectionErrors: collectionErrors.results,
    notifications: {
      videos: notificationCount?.videos ?? 0,
      lastReceivedAt: notificationCount?.lastReceivedAt ?? null,
      recent: notifications.results,
    },
    lastSyncAt: timing?.last_sync_at ?? null,
    lastRunAt: timing?.last_run_at ?? null,
    lastError: timing?.last_error ?? null,
  };
}
