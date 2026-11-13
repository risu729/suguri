# Suguri

Select videos from YouTube subscriptions and collect them in a private playlist.
The name comes from the Japanese word *yorisuguri*: carefully selected.

## Status

The initial application implements WebSub ingestion,
per-user rules and Inbox, category-specific private playlists, durable processing,
Cloudflare Access identity, separate Google authorization, and shared UI/MCP
operations. The health endpoint reports implementation status, not live readiness.

The personal installation is deployed and connected to its owner's selected YouTube
channel. Subscription synchronization, real hub challenge acceptance, and rule-based
writes to owned private playlists have been observed. Initial uploads reconciliation and
naturally arriving notification delivery have separate acceptance checks; deployment or
challenge acceptance alone does not establish notification delivery. See the
[dated verification record](docs/verification-2026-11-12.md) for the evidence and
remaining checks. Follow [activation and acceptance](docs/activation.md) before enabling
automation. AI classification is a future extension; the initial selection engine uses
rules.

Static [application information](https://suguri.takuk.me/info/about) and the
[privacy policy](https://suguri.takuk.me/info/privacy) support Google OAuth branding.
Only those information routes and validated WebSub callbacks are public; the
application, API, authorization routes, and MCP remain protected by Access.

## Development

Install [mise](https://mise.jdx.dev/), then run:

```sh
mise trust
mise install --locked
mise run install
mise run hooks:install
mise run dev
```

Run `mise run fix` to format and `mise run ci` to reproduce CI. CI includes
repository lint, generated-type checking, local Workers tests, a production
build, built-bundle smoke tests, and a prebuilt upload dry run. These checks
do not deploy or access a real YouTube account.

Dependencies use exact versions. Bun maintains `bun.lock`; aube installs it
with integrity checks and reviewed install scripts. To change dependencies,
update package.json, run `mise exec -- bun install --lockfile-only`, then
`mise run install`. Commit the lockfile changes with the dependency update.

## Design and research

- [Architecture](docs/architecture.md)
- [Architecture decision records](docs/adr/README.md)
- [Generalized product requirements](docs/product-requirements.md)
- [Activation and acceptance](docs/activation.md)
- [Research archive and provenance](docs/research/README.md)
- [Setup decisions and reference repositories](docs/setup.md)
- [Implementation backlog](docs/backlog.md)

This is a public repository. No open-source license has been selected.
