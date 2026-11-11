# Implementation status

## Implemented locally

- Per-user D1 catalog, dynamic categories/rules/series, and sticky manual decisions.
- Access account authentication, encrypted Google connection, refresh and disconnect.
- Shared UI/MCP application operations with an explicit parity inventory.
- Signed/bounded WebSub ingestion, challenge verification and lease renewal.
- Paginated subscription sync, uploads reconciliation and bounded backfill.
- Literal rule evaluation, live deferral, metadata refresh and Inbox review.
- Private owned playlist create/attach, insertion, category moves and exclusion.
- Durable operation intents, ambiguous-result reconciliation, bounded retries,
  atomic project/user quota reservations, and external-removal suppression.
- Simple Japanese UI for Inbox, rules, categories, series, connection and settings.

The local and hosted check results for the submitted change must accompany its PR.
These capabilities have not been verified against a real account or deployed.

## Before production activation

- [ ] Choose the exact Cloudflare account, origin, Access application and resources.
- [ ] Apply the D1 migration to the intended database and verify resource bindings.
- [ ] Configure Google API/OAuth, actual quota and publishing/verification mode.
- [ ] Complete user consent and a bounded, explicitly authorized acceptance test.
- [ ] Verify actual WebSub HMAC/payload compatibility and scheduled recovery.
- [ ] Verify actual MCP-client/Access login transport and per-user service mapping.
- [ ] Review retention/deletion/privacy disclosures and edge request logs.

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
