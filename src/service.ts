import { appOrigin } from "./auth.ts";
import { isCategoryId, metadataFromRow, type Principal, type VideoRow } from "./model.ts";
import {
  attachPlaylist,
  ensurePlaylist,
  requestSync,
  retryUncertain,
  runPipeline,
} from "./pipeline.ts";
import { classify, validateRule } from "./rules.ts";
import { appState, audit, getRules, getSettings, reevaluate, withLease } from "./store.ts";
import { HttpError, integer, record, string } from "./util.ts";

export const operations = [
  "config",
  "state",
  "settings",
  "sync",
  "process",
  "videos_add",
  "videos_update",
  "rules_save",
  "rules_delete",
  "rules_preview",
  "categories_save",
  "categories_update",
  "categories_delete",
  "series_save",
  "series_delete",
  "reevaluate",
  "disconnect",
  "connect",
] as const;
export type Operation = (typeof operations)[number];
export const readOperations = new Set<Operation>(["config", "state", "rules_preview", "connect"]);
function id(value: unknown): string {
  if (!isCategoryId(value)) throw new HttpError(400, "invalid_id");
  return value;
}
async function categoryExists(env: Env, uid: string, value: unknown): Promise<string> {
  const category = id(value);
  if (
    !(await env.DB.prepare("SELECT id FROM categories WHERE user_id=? AND id=?")
      .bind(uid, category)
      .first())
  )
    throw new HttpError(400, "invalid_category");
  return category;
}
export function parseVideoUrl(value: unknown): string {
  const raw = string(value, 2048);
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new HttpError(400, "invalid_url");
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") candidate = url.pathname.slice(1);
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else candidate = /^\/(shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[2] ?? null;
  }
  if (!candidate || !/^[A-Za-z0-9_-]{11}$/.test(candidate)) throw new HttpError(400, "invalid_url");
  return candidate;
}
export async function execute(
  env: Env,
  principal: Principal,
  operation: Operation,
  args: unknown = {},
): Promise<unknown> {
  const input = record(args),
    uid = principal.userId;
  if (operation === "config")
    return {
      configured: !!(
        env.APP_ORIGIN &&
        env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET &&
        env.ENCRYPTION_KEY
      ),
    };
  if (operation === "state") return appState(env.DB, principal, input);
  if (operation === "connect")
    return { url: `${appOrigin(env)}/auth/start`, requiresUserInteraction: true };
  if (operation === "rules_preview") {
    let rule;
    try {
      rule = validateRule(input);
    } catch {
      throw new HttpError(400, "invalid_rule");
    }
    if (rule.categoryId) await categoryExists(env, uid, rule.categoryId);
    const settings = await getSettings(env.DB, uid);
    const rows = await env.DB.prepare(
      "SELECT * FROM videos WHERE user_id=? AND published_at>=? ORDER BY discovered_at DESC LIMIT 200",
    )
      .bind(uid, new Date(Date.now() - settings.backfillDays * 86400000).toISOString())
      .all<VideoRow>();
    const matches = rows.results
      .map((row) => ({
        id: row.id,
        title: row.title,
        decision: classify(metadataFromRow(row), [{ ...rule, id: rule.id || "preview" }]),
      }))
      .filter((row) => row.decision.reason === `rule:${rule.id || "preview"}`);
    return { matches, total: matches.length, sampled: rows.results.length };
  }
  if (operation === "process") return runPipeline(env, uid);
  if (operation === "videos_update" && input["action"] === "retry_missing") {
    await retryUncertain(
      env,
      uid,
      string(input["id"], 11),
      integer(input["version"], 0, Number.MAX_SAFE_INTEGER),
      string(input["confirmation"], 100),
    );
    await audit(
      env.DB,
      uid,
      string(input["id"], 11),
      operation,
      "explicit_missing_entry_recovery",
      principal.actor,
    );
    return { ok: true };
  }
  if (
    operation === "categories_update" &&
    (input["action"] === "create" || input["action"] === "attach")
  ) {
    const category = await categoryExists(env, uid, input["id"]);
    if (input["action"] === "create") await ensurePlaylist(env, uid, category);
    else await attachPlaylist(env, uid, category, string(input["playlistId"], 100));
    await audit(env.DB, uid, null, operation, category, principal.actor);
    return { ok: true };
  }
  return withLease(env.DB, uid, async () => {
    let result: unknown = { ok: true };
    switch (operation) {
      case "settings": {
        const previous = await getSettings(env.DB, uid);
        const enabled = input["enabled"] ?? previous.enabled;
        if (typeof enabled !== "boolean") throw new HttpError(400, "invalid_input");
        const budget = integer(input["dailyBudgetUnits"] ?? previous.dailyBudgetUnits, 100, 9500),
          limit = integer(input["dailyInsertLimit"] ?? previous.dailyInsertLimit, 1, 150),
          days = integer(input["backfillDays"] ?? previous.backfillDays, 1, 30);
        await env.DB.prepare(
          "UPDATE settings SET enabled=?,daily_budget_units=?,daily_insert_limit=?,backfill_days=? WHERE user_id=?",
        )
          .bind(Number(enabled), budget, limit, days, uid)
          .run();
        if (days !== previous.backfillDays) await reevaluate(env.DB, uid);
        break;
      }
      case "sync":
        await requestSync(env, uid);
        break;
      case "reevaluate":
        await reevaluate(env.DB, uid);
        break;
      case "disconnect":
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE connection SET access_token='',refresh_token='',expires_at=0,reconnect_required=1 WHERE user_id=?",
          ).bind(uid),
          env.DB.prepare("UPDATE settings SET enabled=0 WHERE user_id=?").bind(uid),
          env.DB.prepare("DELETE FROM oauth_states WHERE user_id=?").bind(uid),
          env.DB.prepare("UPDATE channels SET active=0 WHERE user_id=?").bind(uid),
        ]);
        break;
      case "videos_add": {
        const video = parseVideoUrl(input["url"]);
        await env.DB.prepare(
          "INSERT OR IGNORE INTO videos(user_id,id,channel_id,discovered_at,updated_at) VALUES(?,?,'',?,?)",
        )
          .bind(uid, video, Date.now(), Date.now())
          .run();
        result = { ok: true, id: video };
        break;
      }
      case "videos_update": {
        const video = string(input["id"], 11),
          version = integer(input["version"], 0, Number.MAX_SAFE_INTEGER),
          action = input["action"];
        if (
          !/^[A-Za-z0-9_-]{11}$/.test(video) ||
          !["assign", "exclude", "reset", "retry"].includes(String(action))
        )
          throw new HttpError(400, "invalid_input");
        const row = await env.DB.prepare("SELECT * FROM videos WHERE user_id=? AND id=?")
          .bind(uid, video)
          .first<VideoRow>();
        if (!row) throw new HttpError(404, "not_found");
        if (row.version !== version) throw new HttpError(409, "stale");
        const category =
          action === "assign"
            ? await categoryExists(env, uid, input["categoryId"])
            : action === "retry"
              ? row.category_id
              : null;
        const manual = action === "reset" ? 0 : action === "retry" ? row.manual_override : 1;
        const status =
          action === "assign" ? "queued" : action === "exclude" ? "excluded" : "pending";
        await env.DB.prepare(
          "UPDATE videos SET status=?,category_id=?,manual_override=?,reason=?,last_error=NULL,attempts=0,next_attempt_at=0,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=?",
        )
          .bind(
            status,
            category,
            manual,
            action === "retry" ? row.reason : `manual:${String(action)}`,
            Date.now(),
            uid,
            video,
            version,
          )
          .run();
        break;
      }
      case "rules_save": {
        let rule;
        try {
          rule = validateRule(input);
        } catch {
          throw new HttpError(400, "invalid_rule");
        }
        if (rule.categoryId) await categoryExists(env, uid, rule.categoryId);
        rule.id = rule.id || crypto.randomUUID();
        const existingRules = await getRules(env.DB, uid);
        if (
          existingRules.length >= 500 &&
          !existingRules.some((existing) => existing.id === rule.id)
        )
          throw new HttpError(400, "rule_limit");
        await env.DB.prepare(
          "INSERT INTO rules(user_id,id,definition,priority,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET definition=excluded.definition,priority=excluded.priority,updated_at=excluded.updated_at",
        )
          .bind(uid, rule.id, JSON.stringify(rule), rule.priority, Date.now())
          .run();
        await reevaluate(env.DB, uid);
        result = { ok: true, id: rule.id };
        break;
      }
      case "rules_delete":
        await env.DB.prepare("DELETE FROM rules WHERE user_id=? AND id=?")
          .bind(uid, id(input["id"]))
          .run();
        await reevaluate(env.DB, uid);
        break;
      case "categories_save": {
        const category = input["id"] ? id(input["id"]) : crypto.randomUUID(),
          name = string(input["name"], 120);
        const count = await env.DB.prepare("SELECT count(*) AS n FROM categories WHERE user_id=?")
          .bind(uid)
          .first<{ n: number }>();
        if ((count?.n ?? 0) >= 50) throw new HttpError(400, "category_limit");
        const saved = await env.DB.prepare(
          "INSERT OR IGNORE INTO categories(user_id,id,name) VALUES(?,?,?)",
        )
          .bind(uid, category, name)
          .run();
        if (!saved.meta.changes) throw new HttpError(409, "already_exists");
        result = { ok: true, id: category };
        break;
      }
      case "categories_update": {
        if (input["action"] !== "rename") throw new HttpError(400, "invalid_action");
        await env.DB.prepare("UPDATE categories SET name=? WHERE user_id=? AND id=?")
          .bind(string(input["name"], 120), uid, await categoryExists(env, uid, input["id"]))
          .run();
        break;
      }
      case "categories_delete": {
        const category = await categoryExists(env, uid, input["id"]);
        const used = await env.DB.prepare(
          "SELECT (SELECT count(*) FROM videos WHERE user_id=? AND category_id=?)+(SELECT count(*) FROM series WHERE user_id=? AND category_id=?)+(SELECT count(*) FROM operations WHERE user_id=? AND category_id=?) AS n",
        )
          .bind(uid, category, uid, category, uid, category)
          .first<{ n: number }>();
        if (used?.n || (await getRules(env.DB, uid)).some((rule) => rule.categoryId === category))
          throw new HttpError(409, "category_in_use");
        await env.DB.prepare("DELETE FROM categories WHERE user_id=? AND id=?")
          .bind(uid, category)
          .run();
        break;
      }
      case "series_save": {
        const series = input["id"] ? id(input["id"]) : crypto.randomUUID(),
          name = string(input["name"], 120),
          playlist = string(input["playlistId"], 100),
          mode = input["mode"];
        if (!/^[A-Za-z0-9_-]{10,100}$/.test(playlist) || (mode !== "hold" && mode !== "follow"))
          throw new HttpError(400, "invalid_series");
        const category = input["categoryId"]
          ? await categoryExists(env, uid, input["categoryId"])
          : null;
        if (mode === "follow" && !category) throw new HttpError(400, "invalid_category");
        const previous = await env.DB.prepare(
          "SELECT playlist_id FROM series WHERE user_id=? AND id=?",
        )
          .bind(uid, series)
          .first<{ playlist_id: string }>();
        if (previous && previous.playlist_id !== playlist)
          throw new HttpError(409, "series_playlist_immutable");
        const count = await env.DB.prepare("SELECT count(*) AS n FROM series WHERE user_id=?")
          .bind(uid)
          .first<{ n: number }>();
        if (!previous && (count?.n ?? 0) >= 50) throw new HttpError(400, "series_limit");
        await env.DB.prepare(
          "INSERT INTO series(user_id,id,name,playlist_id,category_id,mode,started_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,mode=excluded.mode,last_checked_at=0",
        )
          .bind(uid, series, name, playlist, category, mode, Date.now())
          .run();
        await reevaluate(env.DB, uid);
        result = { ok: true, id: series };
        break;
      }
      case "series_delete":
        await env.DB.batch([
          env.DB.prepare("DELETE FROM series_videos WHERE user_id=? AND series_id=?").bind(
            uid,
            id(input["id"]),
          ),
          env.DB.prepare("DELETE FROM series WHERE user_id=? AND id=?").bind(uid, id(input["id"])),
        ]);
        await reevaluate(env.DB, uid);
        break;
      default:
        throw new HttpError(404, "operation_not_found");
    }
    await audit(env.DB, uid, null, operation, "completed", principal.actor);
    return result;
  });
}
