import { HttpError, integer, record, string } from "./util.ts";

// One statement checks every version before changing any member of the selection.
export async function updateVideos(
  db: D1Database,
  userId: string,
  input: Record<string, unknown>,
): Promise<number> {
  const action = input["action"];
  if (!["assign", "exclude", "reset", "retry"].includes(String(action)))
    throw new HttpError(400, "invalid_input");
  const items = input["items"];
  if (!Array.isArray(items) || items.length < 1 || items.length > 50)
    throw new HttpError(400, "invalid_selection");
  const selected = items.map((item) => {
    const value = record(item);
    const id = string(value["id"], 11);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new HttpError(400, "invalid_input");
    return { id, version: integer(value["version"], 0, Number.MAX_SAFE_INTEGER) };
  });
  if (new Set(selected.map((item) => item.id)).size !== selected.length)
    throw new HttpError(400, "invalid_selection");
  const result = await db
    .prepare(`WITH eligible AS MATERIALIZED (
      SELECT v.id FROM videos v JOIN json_each(?) j ON v.id=json_extract(j.value,'$.id')
      AND v.version=json_extract(j.value,'$.version') WHERE v.user_id=?
    ) UPDATE videos SET
      status=CASE ? WHEN 'assign' THEN 'queued' WHEN 'exclude' THEN 'excluded' ELSE 'pending' END,
      category_id=CASE ? WHEN 'assign' THEN ? WHEN 'retry' THEN category_id ELSE NULL END,
      manual_override=CASE ? WHEN 'reset' THEN 0 WHEN 'retry' THEN manual_override ELSE 1 END,
      reason=CASE WHEN ?='retry' THEN reason ELSE ? END,
      needs_classification=0,last_error=NULL,attempts=0,next_attempt_at=0,updated_at=?,version=version+1
      WHERE user_id=? AND id IN (SELECT id FROM eligible) AND (SELECT count(*) FROM eligible)=?`)
    .bind(
      JSON.stringify(selected),
      userId,
      action,
      action,
      input["categoryId"] ?? null,
      action,
      action,
      `manual:${String(action)}`,
      Date.now(),
      userId,
      selected.length,
    )
    .run();
  if (result.meta.changes !== selected.length) throw new HttpError(409, "stale");
  return selected.length;
}
