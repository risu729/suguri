# Product requirements

Accepted direction: 2026-11-11. This document describes generalized capabilities,
not an account's personal selection rules. Runtime rules, categories, channel
preferences, series, and playlist mappings belong to each user's database data.
The implementation status is tracked in [the backlog](backlog.md).

## Selection and correction

- Receive new candidates from subscribed channels; retain excluded candidates so
  a later rule change can reconsider them within a bounded historical window.
- Rules can categorize, exclude, or leave a candidate in the Inbox. Users can
  express different channel behavior: accept a matching kind, exclude it, or
  require manual review. No channel names or personal rules ship in the source.
- Users create their own categories and connect one owned private playlist to
  each category. Categories are not an application enum or global configuration.
- Keep content category separate from distribution format. A concert can be an
  uploaded performance, a live broadcast, a simulcast, a replay, or a partial
  free broadcast. A partial concert is not automatically a promotional teaser.
- Support literal inclusion/exclusion keywords and channel-specific rules.
  Teasers, trailers, recaps, and actual musical performances need distinct
  decisions; keyword rules cannot guarantee semantic understanding.
- Distinguish ordinary uploads from completed broadcast archives without using
  duration as the definition. A user may create separate listening categories
  for those formats. Shorts remain eligible under the same policies; the public
  API does not supply a reliable general-purpose `isShort` field.
- Defer upcoming and currently live videos until they end. Real-time viewing is
  not required. Publicly unavailable/deleted videos remain visibly unresolved.
- A simple Inbox shows thumbnail, title, channel, description, status, and the
  decision reason. It supports assigning/moving, excluding, retrying, and
  releasing a manual override back to rules. Manual choices are sticky.
- Rule changes automatically reevaluate recent non-manual candidates. Support
  configurable backfill from 1 through 30 days, with convenient 7/30-day choices.
  Do not scan unlimited history or overwrite manual corrections.

## Playback and series

YouTube's official API cannot retrieve the user's watch history or per-video
viewing progress. Do not claim automatic watched-item removal. A missing managed
playlist item means only that it was removed externally; do not infer whether
it was watched, disliked, or removed after a policy change. Do not silently add
it back. An explicit new assignment can restore it.

`playlists.list(mine=true)` lists playlists owned by the authenticated channel;
it is not a general listing of other people's playlists saved in the YouTube UI.
Allow a user to register a series by playlist URL/ID. The public/authorized
playlist's contents can then be read. Use explicit `hold` and `follow` modes:

- Hold: known series members remain in the Inbox for manual catch-up.
- Follow: eligible members in the configured window route to a chosen category.

The user changes the mode when caught up. Viewing progress is not inferred.
Membership discovery is paginated; unobserved memberships are not yet known.
The first release must describe that limit rather than promising immediate
coverage of every historical series member.

## Account and operation boundaries

Cloudflare Access authenticates the Suguri account. Google OAuth connects that
account to YouTube for authorization only. Connecting or reconnecting Google
must not create a different Suguri account or mix data between Access users.

Every UI read/write operation must have an MCP equivalent. HTTP and MCP are thin
adapters over the same validated application operation; MCP must not query D1
directly. Requests derive the user from a verified Access identity, never from
an arbitrary user ID in tool arguments. Google consent remains a browser action;
MCP can return its connection URL, not consent on the user's behalf.

This follows
[Kogane ADR 0081](https://github.com/risu729/kogane/blob/main/docs/adr/0081-ui-parity-through-mcp.md)
for parity and shared services. Suguri's user isolation is deliberately narrower than
Kogane's single-store operator authority.

## Delivery and resilience

Validate WebSub subscription intent, topic, channel identity, capability token,
signature, and bounded Atom body before persisting candidate IDs. Acknowledge
only after persistence. Duplicate notifications must not erase decisions.
Renew leases and reconcile channel uploads to repair missed notifications.

Provider calls use bounded execution, daily project/user budgets, deferred work
for quota exhaustion, and bounded retries for transient failures. Persist an
operation intent before a playlist write. After an ambiguous insertion or
process crash, reconcile membership before further writes. An absent list result
does not immediately prove the original request failed. Leave unresolved writes
visible rather than risking duplicate entries. Move by adding the destination
before removing the old tracked item. Never delete arbitrary caller-supplied
playlist item IDs.

Cloudflare Workflows must be evaluated for durable orchestration. Its retry
mechanism cannot by itself make YouTube insertion idempotent. The first
implementation uses a D1-backed queue and Cron; the operation ledger remains
necessary if Workflows is introduced later.

## Optional AI classification target

Support interchangeable providers as a future capability: Cloudflare Workers AI, OpenAI,
and Anthropic/Claude. Rules should run first; AI should handle explicitly opted-in
ambiguous candidates, with metadata treated as untrusted input. A model may suggest an
existing category or review/exclude decision, never arbitrary URLs, API actions,
playlist IDs, or user IDs. Validate its response and preserve manual decisions.
Low-confidence or invalid responses remain in the Inbox.

Provider choice, model, cost cap, and data-sharing consent are user settings;
credentials are kept in encrypted storage or deployment secrets, never public
rules. The initial implementation does not call an AI provider, require an API
key, or send video metadata to an LLM. A provider integration needs its own
implementation, synthetic tests, and explicitly authorized activation.

## Source checks

- [Watch history is not accessible](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
- [Owned playlist listing](https://developers.google.com/youtube/data/reference/rest/v3/playlists/list)
- [Video metadata](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- [Cloudflare Workflows and idempotency](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
