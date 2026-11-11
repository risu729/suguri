import { getSettings } from "./store.ts";
import type { YouTube } from "./youtube.ts";

const day = 86400000;
export async function expireMetadata(db: D1Database, now = Date.now()): Promise<void> {
  // Decisions and operation receipts are application state; this clears stale API display metadata.
  await db
    .prepare(
      "UPDATE videos SET channel_title='',title='',description='',thumbnail_url='',duration_seconds=NULL,metadata_fetched_at=0,metadata_dirty=1,version=version+1 WHERE metadata_fetched_at>0 AND metadata_fetched_at<? AND NOT EXISTS(SELECT 1 FROM leases WHERE name=videos.user_id||':pipeline' AND expires_at>?)",
    )
    .bind(now - 29 * day, now)
    .run();
  await db.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(now).run();
}
export async function refreshMetadata(
  env: Env,
  userId: string,
  api: Pick<YouTube, "video">,
): Promise<void> {
  const settings = await getSettings(env.DB, userId);
  const rows = await env.DB.prepare(
    "SELECT id,version FROM videos WHERE user_id=? AND (metadata_dirty=1 OR (metadata_fetched_at>0 AND metadata_fetched_at<?)) ORDER BY metadata_fetched_at LIMIT 2",
  )
    .bind(userId, Date.now() - 7 * day)
    .all<{ id: string; version: number }>();
  for (const row of rows.results) {
    // oxlint-disable-next-line no-await-in-loop -- Refresh a bounded number under the pipeline's lease and quota.
    const metadata = await api.video(row.id);
    const now = Date.now();
    if (!metadata) {
      // oxlint-disable-next-line no-await-in-loop -- Deleted/inaccessible metadata must not remain on display.
      await env.DB.prepare(
        "UPDATE videos SET channel_title='',title='',description='',thumbnail_url='',duration_seconds=NULL,metadata_fetched_at=?,metadata_dirty=0,version=version+1,last_error='video_unavailable' WHERE user_id=? AND id=? AND version=?",
      )
        .bind(now, userId, row.id, row.version)
        .run();
      continue;
    }
    const recent = Date.parse(metadata.publishedAt) >= now - settings.backfillDays * day;
    // oxlint-disable-next-line no-await-in-loop -- Persist only the fetched row without changing a manual decision.
    await env.DB.prepare(
      "UPDATE videos SET channel_id=?,channel_title=?,title=?,description=?,published_at=?,duration_seconds=?,live_state=?,ended_at=?,thumbnail_url=?,metadata_fetched_at=?,metadata_dirty=0,status=CASE WHEN manual_override=0 AND ? AND attempts<6 THEN 'pending' ELSE status END,next_attempt_at=CASE WHEN manual_override=0 AND ? AND attempts<6 THEN 0 ELSE next_attempt_at END,version=version+1 WHERE user_id=? AND id=? AND version=?",
    )
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
        Number(recent),
        Number(recent),
        userId,
        row.id,
        row.version,
      )
      .run();
  }
}
