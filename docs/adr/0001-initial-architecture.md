# ADR 0001: Self-built WebSub selector on Cloudflare with per-user rules

- Status: accepted (records decisions the owner already made)
- Date: 2026-11-11; recorded 2026-11-13 from the owner's decisions in the
  conversation that created the repository
- Owning documents: [product requirements](../product-requirements.md),
  [architecture](../architecture.md)

## Context

The owner periodically read the subscription feed and added videos to Watch
Later by hand, and wanted rules, and later optional AI, to do it. The decisions
below were made in conversation on 2026-11-11 and were implemented in
[PR #6](https://github.com/risu729/suguri/pull/6) and later PRs, but only their
results were written into the requirements and architecture; the options and the
owner's choices were not recorded in the repository.

## Options considered

| Question             | Options                                                                                                                   | Chosen                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Destination          | Watch Later (no official API write); private playlists                                                                    | Private playlists, one per user-defined category            |
| Build or adopt       | Run an existing open-source tool (for example `keif/playlist-from-subs`); build on Cloudflare using them as reference     | Build on Cloudflare; open-source tools are reference only   |
| Discovery            | Poll channel RSS feeds; YouTube WebSub push notifications                                                                 | WebSub, with uploads reconciliation to repair missed pushes |
| Identity             | Google sign-in as the account; Cloudflare Access as the account and Google OAuth only as a YouTube connection             | Access identity; Google OAuth is authorization only         |
| Where rules live     | In the repository; per user in the database                                                                               | Per user in D1; the repository holds no personal rules      |
| Agent access         | MCP tools that query D1; MCP tools over the same operations as the UI                                                     | One application service behind both the UI and MCP          |
| Durable processing   | Cloudflare Workflows; a D1-backed queue driven by Cron                                                                    | D1 queue and Cron, with a playlist-write operation ledger   |
| Watched-item cleanup | Remove watched items automatically; leave removal to the user                                                             | Manual removal; external removals are recorded, not guessed |

## Decision

The owner decided, in UTC on 2026-11-11:

- 11:50: use a private playlist; Watch Later is not needed.
- 12:02: run on Cloudflare and build it; existing open-source tools are only a
  reference.
- 13:09: use YouTube's new-upload notifications (WebSub) rather than polling.
- 13:52: make the repository public, so that GitHub Free enforces its rulesets.
- 14:12: route each category of content to its own private playlist; include
  Shorts; live streams can wait until they end; provide a simple UI for manual
  correction.
- 14:19: keep rules, categories and playlist mappings per user in the database
  so the product is general; Cloudflare Access is the account and Google OAuth
  only connects that account to YouTube; every UI change is also available
  through MCP using the same API, never by MCP reading the database; consider
  Workflows; make the rule-change backfill window configurable (for example one
  week or one month); retry failed processing and playlist writes durably; support
  Cloudflare Workers AI, OpenAI and Anthropic as optional classifiers later;
  remove watched items automatically only if the API exposes viewing state.
- 15:28: serve the application at `suguri.takuk.me`.

An agent decided the remaining points on the owner's request to consider them:

- Workflows was evaluated and not adopted for the first implementation: a retried
  YouTube insert is not idempotent, so the operation ledger and provider reconciliation
  are needed either way, and a D1 queue avoids a second dispatch boundary
  ([architecture](../architecture.md#quotas-retries-and-orchestration-choice)).
- The YouTube Data API exposes neither watch history nor other users' saved
  playlists, so automatic watched-item removal is not implemented and series
  are registered by playlist URL with explicit hold and follow modes
  ([product requirements](../product-requirements.md#playback-and-series)).

## Consequences

- Google OAuth needs the YouTube write scope and a consent-screen publishing or
  verification mode that supports continuous use ([activation](../activation.md));
  Access policy, not Google, decides who can use Suguri.
- Personal selection preferences are runtime data. Tests use synthetic fixtures,
  and the repository describes generalized behavior only.
- A UI operation without its MCP tool is not done; the parity test enforces the
  route and tool inventories.
- Missed notifications are repaired by bounded uploads reconciliation.
- The agent implementing the owner's 14:19 request set the rule-change
  re-evaluation window to 1 to 30 days, with 7 and 30 days offered in the UI.
- AI classification remains a documented target. Choosing a provider, model,
  cost cap and data-sharing consent is a later owner decision.

## Verification

- [PR #6](https://github.com/risu729/suguri/pull/6) implemented WebSub
  ingestion, per-user rules, Access identity, separate Google authorization,
  shared UI and MCP operations, and the D1 queue with synthetic tests.
- The [verification record](../verification-2026-11-12.md) records the
  production deployment, the Google connection to the owner-selected channel and
  rule-based writes to owned private playlists.
- Sustained delivery of naturally arriving notifications is not yet verified
  ([issue #17](https://github.com/risu729/suguri/issues/17)).
