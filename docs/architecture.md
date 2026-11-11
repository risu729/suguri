# Architecture

## Accepted direction

Build a TypeScript application on Cloudflare Workers. Use existing YouTube
automation projects as references only; do not fork or install them. A normal
private playlist is acceptable; Watch Later is not required.

WebSub is the primary source of new-video notifications. Use Cron for lease
renewal, subscription synchronization, low-frequency reconciliation, and
rechecking deferred live or scheduled videos. Rules run first; AI may handle
ambiguous candidates after the user selects rules and a provider.

## Proposed data flow

1. OAuth authorizes subscription reads and private-playlist writes.
2. Synchronize channel IDs; maintain a WebSub subscription for each channel.
3. Verify notifications, persist candidate IDs, and promptly acknowledge receipt.
4. Retrieve metadata, deduplicate, evaluate rules, and optionally classify with AI.
5. Add eligible videos to the fixed private playlist with bounded retries.

D1 is the proposed durable ledger. Queues may decouple ingestion from processing
if the observed workload needs them. Neither resource is provisioned or bound.
Persist video/playlist idempotency keys and processing states. Reconcile ambiguous
API write timeouts before retrying to avoid duplicate playlist entries.

## Authentication and trust

Public-channel WebSub notifications need no Google user authorization. Automatic
subscription reads and private-playlist writes need OAuth. A subscriptions export
is an optional import path, not a substitute for playlist-write authorization.

Use a server-side authorization-code flow, state validation, offline access,
secure token storage, and a fixed destination channel and playlist. Read-only
YouTube scope cannot insert playlist items. Supported write scopes grant broader
access than one playlist; enforce the narrower operation boundary in code.

External/Testing refresh tokens can expire after seven days for these scopes.
Confirm publishing status and the personal-use verification exception before
continuous operation. The user performs Google consent. No password or cookie
collection is planned. Decide the secure first-token insertion and rotation
workflow before implementing OAuth; running Workers do not rewrite Secrets by
themselves.

WebSub callbacks must remain reachable by the hub, separately from authenticated
administration. Validate topics, channel/video IDs, subscription challenges and
lease periods. Confirm hub signature support in an authorized integration test.
Bound payload size and parse Atom defensively. Notifications are untrusted input.

## Quota planning

The research snapshot records a default 10,000 Data API units per day and
50 units per playlist insertion. Fifty insertions consume 2,500 units before
reads, failed requests, or retries. Two hundred insertions exhaust that default
budget. Actual project allocation and daily volume are unverified. The daily
reset uses Pacific time. Short-term rate limits, WebSub hub limits, and
Cloudflare limits are separate.

Use a daily insertion budget, bounded concurrency, backoff with jitter, and
deferred work when quota is exhausted. Do not retry invalid grants indefinitely
or use multiple projects to evade quotas. WebSub does not guarantee complete
history or delivery, so retain low-frequency reconciliation.

## Evidence

These decisions summarize the [dated source archive](research/README.md).
Recheck provider behavior before implementation:

- [YouTube push notifications](https://developers.google.com/youtube/data/guides/push_notifications)
- [W3C WebSub](https://www.w3.org/TR/websub/)
- [Playlist insertion](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [YouTube quota costs](https://developers.google.com/youtube/data/determine_quota_cost)

No actual subscription, notification, consent, playlist write, or deployment has
been performed by this scaffold.
