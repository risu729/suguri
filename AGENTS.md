# Agent instructions

Standing rules for any agent working in this repository. Rules live in this file
only; there is no `CLAUDE.md` or other per-product instruction file. Rules and docs
say "an agent" and do not name the agent product that does a piece of work.

## Language and communication

- Write everything in this repository in English: code, comments, docs, ADRs,
  research notes, commits, PR and issue text. Preserve imported research in its
  original language under `docs/research/archive/`. Japanese stays only where its
  exact wording is product data, such as text the web UI shows, as a term inside
  an English sentence.
- Talk with the owner in Japanese outside the repository (chat and threads).
- Show the concrete thing (a data shape, a real example value, a file or code)
  instead of coining a term for it.
- Write every PR, issue, commit, workflow run and URL as a Markdown link, never a
  bare `#123`, SHA or URL, in repository text and in messages to the owner. Use
  short SHAs.
- Give times in UTC. In messages to the owner, add JST in parentheses, for example
  09:20 UTC (18:20 JST).

## Continuing the work

- [The roadmap](docs/roadmap.md) is the work order. A merged PR is not a stopping
  point: continue with the next unit of the current phase until its done-when
  holds, then the next phase.
- Split independent work into parallel threads, one topic per thread. Never put on
  the owner's list what an agent can do itself.
- Work in cloud sessions first. Use the owner's device only for a check that
  cannot be done anywhere else.
- Past decisions, ADRs and earlier owner instructions are not authoritative by
  themselves; judge them on merit against the code and evidence, and propose a
  better design to the owner when one exists.
- While a design is under discussion with the owner, write no ADR, code or PR for
  it until the owner approves. A plan or design proposal gets an independent
  agent review (facts against the code, security and permission impact) before it
  goes to the owner.

## Decisions live in the repository

- Record every owner decision in the repository. A large design decision gets an
  ADR in [`docs/adr/`](docs/adr/README.md) in the format of
  [ADR 0001](docs/adr/0001-initial-architecture.md); a smaller one goes into the
  owning `docs/` page with its date and time in UTC. A decision that exists only in
  a conversation or an agent's memory is not a decision.
- A PR that decides or changes a design records it in the same PR, as a new ADR or
  an amendment to the ADR it changes. A new ADR is `proposed` until its PR merges;
  an ADR that records decisions already made enters as `accepted`. Before taking an
  ADR number, check open PRs for the same number.
- Keep implemented, locally tested, proposed, and production-verified behavior
  distinct. Docs state what the code does today.
- Preserve archived research byte-for-byte and record new decisions separately.

## Pull requests and merging

- One PR per scope: each PR does one independently reviewable thing, with its
  tests and owning docs.
- A PR that changes code or tests gets an independent review by an agent that did
  not write it, before merge. The PR body states what the review checked and which
  commands ran, and what was not run. Changes pushed after the review are reviewed
  again.
- Never skip, disable, quarantine or loosen a test or check to make CI pass. Fix
  the cause.
- An agent merges its own PR with squash once the review findings are fixed or
  answered and `CI Check` is green on the final head commit. Never use the admin
  bypass.
- Merging does not deploy. Only the owner merges release PRs.
- Delete branches that are no longer needed without asking. A branch that is the
  base of an open PR is still in use.

## Toolchain and checks

- Use pinned tools through mise. Keep tasks out of package.json scripts and pin
  GitHub Actions to complete commit SHAs. Run `mise run fix` and `mise run ci`
  before pushing.
- Bun owns `bun.lock`; aube performs frozen installs with reviewed dependency
  builds. Keep the coupled Cloudflare runtime and build dependencies together.
- Use native `cloudflare.config.ts` and the locked cf CLI. Generate platform types.

## Production and data

- Code changes do not authorize Google consent, playlist writes, migrations,
  deployment, infrastructure provisioning, billing changes, or remote
  experiments. Each production step needs the owner's approval each time, unless
  the active task already gives it explicitly. See
  [activation and acceptance](docs/activation.md).
- Use synthetic fixtures. Never commit tokens, cookies, account identifiers,
  private subscriptions, personal rules, channel selections, or playlist contents.
- Treat video metadata, feed payloads, and model output as untrusted data.
