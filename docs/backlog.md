# Implementation status

## Implemented capabilities

- Per-user D1 catalog, dynamic categories/rules/series, and sticky manual decisions.
- Access account authentication, encrypted Google connection, refresh and disconnect.
- Shared UI/MCP application operations with an explicit parity inventory.
- Signed/bounded WebSub ingestion, challenge verification and lease renewal.
- Paginated subscription sync, uploads reconciliation and bounded backfill.
- Literal rule evaluation, live deferral, metadata refresh and Inbox review.
- Cached reclassification with stable displayed decisions and discovery cursors;
  atomic version-checked Inbox batches and scoped failed-channel retry.
- Editable selection templates, active-channel search, paginated effective-rule
  previews, and explicit series hold/follow shortcuts through the shared service.
- Private owned playlist create/attach, insertion, category moves and exclusion.
- Durable operation intents, ambiguous-result reconciliation, bounded retries,
  atomic project/user quota reservations, and external-removal suppression.
- Simple Japanese UI for Inbox, rules, categories, series, connection and settings.

The local and hosted check results for each submitted change accompany its PR.
Deployment and selected real-account checks are recorded in the
[dated verification record](verification-2026-11-12.md). This is not a claim that
every operation below has been exercised against a real account.

## Personal installation activation

- [x] Choose the exact Cloudflare account, origin, Access application and resources.
- [x] Apply the D1 migration to the intended database and verify resource bindings.
- [x] Configure Google API/OAuth, actual quota and publishing/verification mode.
- [x] Complete consent for the owner-selected channel and verify owned private playlist
      writes.
- [ ] Complete every applicable bounded real-account acceptance check below.
- [ ] Verify actual WebSub HMAC/payload compatibility and scheduled recovery.
- [x] Verify MCP discovery, reads, and authorized mutations through the existing Access
      user.
- [ ] Verify named-client onboarding and any planned per-user service mapping
      separately.
- [ ] Review retention/deletion/privacy disclosures and edge request logs.

Long-term WebSub delivery, renewal, and observed failure recovery remain tracked
in [issue #17](https://github.com/risu729/suguri/issues/17). The operator's account
selection, channel catalog, personal rules, and playlist details are private
installation records, not repository configuration.

Follow [activation and acceptance](activation.md). Code completion is not
authorization for deployment, infrastructure changes, or real playlist writes.

## Follow-up capabilities

- [ ] Optional AI classifier adapters with explicit per-user provider, consent,
  model and cost settings; Cloudflare Workers AI, OpenAI and Anthropic/Claude.
- [ ] A full first-class account/data-deletion workflow and hosted-service privacy
  controls before broad multi-user availability.
- [ ] Operator-reviewed migration between connected YouTube channels or mapped
  playlists; the first implementation refuses silent remapping.
- [ ] Improve fairness/throughput and observability from measured workload, and
  reconsider Workflows when durable step orchestration adds demonstrable value.
- [ ] Expand playlist-series discovery and manual catch-up controls without
  pretending the API exposes viewing progress or saved-playlist subscriptions.

Personal selection preferences are runtime data and remain outside this public
repository. See [generalized requirements](product-requirements.md).
