# Architecture

## Runtime

Suguri is a TypeScript Cloudflare Worker with D1 and a five-minute Cron trigger.
The UI is server-rendered HTML with a small same-origin JavaScript client.
No runtime resource has been provisioned by this implementation.

WebSub is the primary discovery path. A callback validates its stored capability,
subscription intent/topic, HMAC, and bounded Atom payload, then persists candidate
IDs before acknowledging. The database is the durable queue: candidates retain
status, attempts, next-attempt time, metadata, manual override, and version.
Authenticated duplicate updates mark metadata dirty without replacing decisions.

A bounded processing pass renews WebSub leases, advances subscription and series
pagination, reconciles actual channel uploads playlists, refreshes metadata,
detects external removals, and processes candidates. A per-user lease serializes
pipeline writes with manual decisions. Provider requests also verify that the
lease still belongs to the caller before a network operation. Expired workers
must not continue writing after a new owner takes over.

The current scheduler advances at most two connected users per invocation, in
least-recently-processed order. Each pass is bounded to approximately 85 seconds
and 40 YouTube calls, with smaller per-operation limits. This is an initial
personal/small-installation implementation, not a demonstrated large-tenant SLA.

## Identity and storage

Cloudflare Access JWTs are verified with the configured issuer, audience, RS256
signature, expiry, and application token type. The account ID derives from the
issuer and stable Access subject. Email headers are never proof of identity.
Every user-owned row and query is scoped to that account ID. Composite keys and
foreign keys prevent a user's category from being attached to another's video.

Google OAuth is a separate connection, using state, a browser-bound secure cookie,
PKCE, offline access, and the YouTube write scope. Access authentication does not
depend on Google. Access/refresh tokens and PKCE verifiers are AES-GCM encrypted
with user-bound additional data. The encryption key and OAuth client secret are
deployment secrets. Account switching is refused while the existing connection
and playlist mappings belong to another YouTube channel.

OAuth callback commit and disconnect share the pipeline lease. Disconnect clears
local tokens, pauses automatic work, and deactivates callbacks; it does not remove
the Access account or revoke the provider grant. The UI explains that distinction.
Reconnect restarts subscription pagination from the beginning. Invalid refresh
grants require user reconnection rather than an endless retry loop.

## Shared application service

`service.ts` owns validated operations. `transport.ts` maps each operation to an
HTTP route and an MCP tool, calling the same function with a server-resolved
principal. The MCP adapter contains no SQL. The parity test compares the route
and tool inventories and exercises shared behavior.

Browser mutations require a same-origin header and CSRF token. MCP is stateless
Streamable HTTP with JSON responses at `/mcp`. An Access-authenticated user can
act as that user. A verified Access service identity needs an explicit secret
mapping in `MCP_USERS` to the intended Access user; it is not granted all users'
data. The mapping configures authentication, not Google authorization. Browser
requests to MCP also require CSRF protection. Cross-origin requests are rejected.

OAuth connection links are available to MCP, but Google consent remains a human
browser action. Client login/Access transport compatibility must be verified with
the actual MCP client or trusted Access gateway before deployment is accepted.

## Selection and playlist writes

Categories, rules, and series are dynamic per-user data. There are no seeded
personal preferences. Enabled rules use deterministic priority/ID order and
Unicode-normalized literal keywords. All condition groups must match; any keyword
inside an include group may match. A title exclusion vetoes that rule. A global
exclusion should be a higher-priority exclude rule, not merely an exclusion on
one category rule. Unmatched candidates remain in review.

Manual assignment/exclusion survives feed updates and rule changes until released.
Live/upcoming videos remain deferred until an end time is available. Duration is
not used as a proxy for Shorts or broadcast format. Rule edits reevaluate only
non-manual candidates in the configured 1-30-day window and schedule bounded
uploads reconciliation. Inbox metadata includes a YouTube thumbnail, title,
channel, description, and a reason for the current decision.

Each playlist destination must belong to the connected YouTube channel and be
private. Existing mappings cannot silently migrate to another playlist.
Creation persists an uncertainty marker before the provider call and searches
owned playlists by a stable marker before attempting creation. Unresolved
creation requires reconciliation or manually attaching an existing private list.

Insertion persists its intent before the network call. After a crash or ambiguous
response, the next pass checks the exact playlist/video pair. It adopts one
confirmed entry; zero or multiple entries remain uncertain. A retry never assumes
an absent read proves the original insertion failed. Explicit missing-entry
recovery requires user confirmation and a fresh owner/privacy/membership check.
Moves add the new destination before deleting old entries. Deletes use only exact
item IDs in the user's managed ledger and treat a confirmed 404 as completed.
External removals are sticky and never classified as watched automatically.

## Quotas, retries, and orchestration choice

An atomic D1 batch reserves both the shared project allowance and the user's
budget before each YouTube request. A rejected user reservation does not consume
the project budget. The shared software ceiling is 9,500 units/day; a user's
default is 7,500 units and 50 insertions. These are conservative application
limits, not proof of the actual Google project's allocation. The quota day uses
America/Los_Angeles. Quota exhaustion postpones work without consuming the normal
transient retry count. Transient failures use bounded backoff;
terminal failures remain visible for explicit correction/retry.

Cloudflare Workflows was evaluated. It supplies durable steps and automatic
retries, but a repeated YouTube insert is not idempotent. Suguri still needs the
same operation ledger and provider reconciliation. The first implementation uses
D1 as its durable queue plus Cron to avoid a second dispatch/outbox boundary.
It recovers committed candidate and operation state after an invocation ends.
Workflows can later orchestrate finer-grained steps if operational evidence
justifies it; adding it must preserve the existing uncertainty and manual-decision
invariants. No Queue or Workflow resource is provisioned.

## Metadata and limits

Cached display metadata is refreshed on updates and periodically. A scheduled
sweep clears display metadata older than 29 days while preserving user decisions
and operation receipts. A disconnected account does not keep displaying stale
titles/descriptions indefinitely. This is not a full retention-policy certification;
an operator must define account deletion, provider-derived identifiers, backups,
and privacy disclosures before offering a hosted multi-user service.

Series membership is paginated. A hold affects known members; it cannot identify
an unseen member before discovery. Watching progress and other people's saved
playlist lists are unavailable through the required API. AI classification is a
documented extension target, not an implemented provider integration.

## Sources

- [Product requirements](product-requirements.md)
- [Research provenance](research/README.md)
- [YouTube push notifications](https://developers.google.com/youtube/data/guides/push_notifications)
- [W3C WebSub](https://www.w3.org/TR/websub/)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [YouTube quota costs](https://developers.google.com/youtube/data/determine_quota_cost)
- [YouTube data storage policy](https://developers.google.com/youtube/terms/developer-policies)
- [Cloudflare Workflows retry rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
