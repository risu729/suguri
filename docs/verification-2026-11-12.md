# Personal installation verification — 2026-11-12

This records observed behavior for the existing personal installation. It does
not authorize additional accounts, grants, infrastructure changes, or experiments.
Personal channel identifiers, rules, playlist contents, and credentials are kept
outside this public repository.

## Verified

- The owner-selected YouTube channel is connected through the existing Access
  account, and automatic processing is enabled with the configured limits.
- Paginated subscription synchronization completed. The real WebSub hub accepted
  subscription challenges for the active catalog. This proves subscription setup,
  not receipt of a newly published video notification.
- Owned private destination playlists were created. Manual and rule-based
  insertions were observed. After initial collection, the saved total matched the
  owned private destination's count in the YouTube UI; all displayed entries had
  distinct video IDs.
- Scheduled processing and explicitly invoked normal application processing advanced
  initial uploads reconciliation across the active catalog. Available uploads playlists
  completed the configured historical window; unavailable playlists are isolated per
  channel and remain visible for later retry rather than blocking the catalog.
- Two real unpublished premieres that previously failed metadata parsing now
  appear as deferred, with no metadata error, after the missing-duration fix.
  Their later publication and processing remain unobserved.
- A direct MCP client using the existing authenticated Access user completed
  initialization, discovered all 18 tools, and read the same catalog. Targeted
  retries, processing, and restoration of the normal insertion limit succeeded
  through MCP and were read back through the HTTP application API. This does not
  establish onboarding in a named desktop/hosted client or a new service grant.
- Infrastructure adoption and a subsequent full no-change plan were recorded in
  [the infrastructure adoption record](https://github.com/risu729/infra/blob/main/docs/suguri-activation.md#completed-three-object-adoption--2026-11-12-jst).

## Checked releases

| Change | Validation | Deployment |
| --- | --- | --- |
| [#18: notification provenance and collection progress](https://github.com/risu729/suguri/pull/18) | 110 synthetic tests, repository checks, independent review, hosted CI/CodeQL | [43154574780](https://github.com/risu729/suguri/actions/runs/43154574780), commit `15776b3de67a605fc45447f245ff6eb5ebb1fc0a` |
| [#21: isolated channel retries and unfinished premieres](https://github.com/risu729/suguri/pull/21) | 132 synthetic tests, repository checks, independent review, hosted CI/CodeQL | [43156725645](https://github.com/risu729/suguri/actions/runs/43156725645), commit `e901d3315112337a482872b8140307902359f818` |

The deployment action verified each uploaded version at 100% traffic. New
application-state fields and the corrected premiere behavior were then read from
the authenticated production application. The separate management connector's
version-read permission was unavailable during these checks; that connector was
not used to claim an independent version readback.

## Still unverified

- Recovery of uploads playlists that remain unavailable with provider HTTP404.
  They are recorded separately from successful backfill and scheduled for later
  retry; their unavailable contents have not been retrieved.
- A naturally arriving, newly published video traversing signature validation,
  discovery, classification, and automatic playlist insertion. Notification
  receipts distinguish new discovery from updates to an already known candidate;
  old backfill insertions do not prove this path.
- Lease renewal across its actual interval and recovery from naturally observed
  transient delivery/write failures. Local fixtures establish implementation
  behavior but do not substitute for production observations.
- Named desktop/hosted MCP-client onboarding, service-identity mapping, and the
  remaining account/series/move/removal acceptance cases in
  [activation and acceptance](activation.md).

Keep [issue #17](https://github.com/risu729/suguri/issues/17) open until its
remaining operational criteria have corresponding evidence. A successful
deployment and subscription challenge alone are insufficient to close it.
