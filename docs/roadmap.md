# Roadmap

This is the work order for Suguri. The owner adopted it on 2026-11-13
(05:52 UTC) against main `f749988`. A merged PR is not a stopping point: continue
with the next unit of the current phase until its done-when holds, then the next
phase. A thread may take a unit from a later phase when it does not depend on
unfinished work.

Issues track individual items; this page names which items belong to which phase.
Update this page in the PR that changes a phase's scope, order or outcome.
[Implementation status](backlog.md) lists what the code does, and the
[dated verification record](verification-2026-11-12.md) lists what production has
shown.

Every step that touches production (applying a migration, dispatching Deploy,
changing infrastructure, real-account writes beyond the enabled automation) needs
the owner's approval each time, as [activation and acceptance](activation.md)
requires.

## Phase 1 — Bring production up to main

[PR #24](https://github.com/risu729/suguri/pull/24) (cached reclassification and
bulk review) merged on 2026-11-12 (11:00 UTC) but has not been deployed. Its code
reads the `needs_classification` column added by
[`0002_reclassification.sql`](../migrations/0002_reclassification.sql), so the
migration must reach the production D1 database before the Worker is deployed.

1. Apply `migrations/0002_reclassification.sql` to the production database through
   the bootstrap procedure in [activation](activation.md).
2. Dispatch the [Deploy workflow](../.github/workflows/deploy.yml) on current `main`.
3. Read back the new behavior from the authenticated application.

**Done when:** the deployed Worker version matches a stated `main` SHA that
includes [PR #24](https://github.com/risu729/suguri/pull/24), the migration is
recorded as applied, and a dated verification record lists the deploy run and the
readback.

## Phase 2 — Production acceptance

Close the gaps listed under "Still unverified" in the
[verification record](verification-2026-11-12.md):

- A newly published video arrives through WebSub, passes signature validation, is
  classified and inserted into a playlist automatically
  ([issue #17](https://github.com/risu729/suguri/issues/17)).
- Lease renewal across its real interval and recovery from observed delivery or
  write failures ([issue #17](https://github.com/risu729/suguri/issues/17)).
- Recovery of uploads playlists that returned HTTP 404.
- The remaining account, series, move and removal cases in
  [activation and acceptance](activation.md).

**Done when:** each item above has dated evidence in a verification record, or is
listed there as waiting on a named condition, and
[issue #17](https://github.com/risu729/suguri/issues/17) is closed or names what is
still missing.

## Phase 3 — Owner-selected channels for the remaining categories

Some categories select by channel and still have no channel list. The owner picks
the channels; an agent then registers them as rules in the running installation.
The owner's choices are runtime data and stay out of this public repository.

**Done when:** every category the owner uses has its channel scope set in
production, and a preview of the effective selection shows the expected channels.

## Phase 4 — AI classification

Design the optional AI classifier described in
[product requirements](product-requirements.md#optional-ai-classification-target):
providers, per-user consent, model and cost settings, and how it runs after rules.
The proposal gets an independent review before it goes to the owner; no ADR, code
or PR is written until the owner approves the design.

**Done when:** the approved design is recorded in an ADR and implemented behind
explicit per-user opt-in, with synthetic tests and a bounded production check the
owner approved.

## Phase 5 — Later work

Taken in any order after the phases above, from
[follow-up capabilities](backlog.md#follow-up-capabilities):

- UI improvements found during phases 2 and 3.
- Account and data deletion, and privacy controls before broader multi-user use.
- Workflows, when measured workload shows durable step orchestration adds value.
