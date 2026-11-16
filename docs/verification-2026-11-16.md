# Production update verification — 2026-11-16

This records the Phase 1 production update in the [roadmap](roadmap.md): applying
[`0002_reclassification.sql`](../migrations/0002_reclassification.sql) and deploying
main with [PR #24](https://github.com/risu729/suguri/pull/24). The owner approved
both steps for this task on 2026-11-16 at 12:01 UTC (21:01 JST). It does not
authorize other production changes. The earlier
[2026-11-12 record](verification-2026-11-12.md) still lists the open acceptance gaps.

## Migration 0002

Applied on 2026-11-16 at 16:39 UTC (01:39 JST, 2026-11-17) to the production D1
database `suguri-catalog`, through the Cloudflare API D1 query endpoint.

- Before: `pragma_table_info('videos')` had no `needs_classification` column, and
  `videos` held 1,783 rows. The database has no `d1_migrations` table, because
  `0001_catalog.sql` was also applied outside Wrangler's migration tracking, so the
  check was made against the schema itself.
- A D1 Time Travel bookmark taken immediately before the change:
  `00000678-00000000-00005125-ad08389d0ec2a8c2cb1053c3225b713d`.
- Executed the two statements of the migration file unchanged. Both returned
  success.
- Read back afterwards:
  - `videos.needs_classification` is `INTEGER NOT NULL DEFAULT 0` with the
    `CHECK(needs_classification IN (0,1))` constraint in the stored table SQL.
  - Index `videos_classification` exists on
    `(user_id, needs_classification, next_attempt_at)`.
  - All 1,783 rows kept their data and have `needs_classification = 0`.

## Deployment

| Change | Validation | Deployment |
| --- | --- | --- |
| main [`1d1c372`](https://github.com/risu729/suguri/commit/1d1c372902095c1c602b488eb578ab728858a7c6), including [#24: safe bulk review and cached reclassification](https://github.com/risu729/suguri/pull/24) | Repository checks and CodeQL inside the Deploy run | [43909944955](https://github.com/risu729/suguri/actions/runs/43909944955) |

The run was dispatched at 16:39 UTC (01:39 JST, 2026-11-17), after the migration
readback, and finished successfully at 16:41 UTC. The Cloudflare deployments API
then listed Worker version `68e9556d-1a5c-4c94-a152-fc191d115acb` at 100% traffic,
created at 16:41:17 UTC. Triggers were not redeployed.

## Observed after deployment

- The first scheduled run on the new version, at 16:45:48 UTC (01:45 JST), completed
  and advanced `settings.last_run_at`. It updated eight candidates (all ending in
  `deferred`). The stored run error stayed `youtube_http_404`, the same value as
  before the deployment: the known unavailable uploads playlists, not a schema
  error. The scheduled work query reads `needs_classification`, so this run
  exercised the new column against production.
- No candidate has `needs_classification = 1` yet; nothing has requested a
  reevaluation since the deployment.

## Still unverified

- A readback of the new behavior from the authenticated application through
  Cloudflare Access: the per-video selection checkboxes and bulk actions
  (`POST /api/videos/batch`), and a reevaluation that shows the
  「ルール再判定待ち」 badge. The evidence above comes from the Cloudflare API and
  the database, not from the authenticated application.
