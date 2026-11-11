# Suguri

Select videos from YouTube subscriptions and collect them in a private playlist.
The name comes from the Japanese word *yorisuguri*: carefully selected.

## Status

The initial application is implemented for local verification: WebSub ingestion,
per-user rules and Inbox, category-specific private playlists, durable processing,
Cloudflare Access identity, separate Google authorization, and shared UI/MCP
operations. The health endpoint reports implementation status, not live readiness.

The personal installation has been deployed. Google connection, real notification
delivery, and playlist writes have separate activation checks; deployment alone
does not establish their success.
Follow [activation and acceptance](docs/activation.md) before enabling automation.
AI classification is a future extension; the initial selection engine uses rules.

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
- [Generalized product requirements](docs/product-requirements.md)
- [Activation and acceptance](docs/activation.md)
- [Research archive and provenance](docs/research/README.md)
- [Setup decisions and reference repositories](docs/setup.md)
- [Implementation backlog](docs/backlog.md)

This is a public repository. No open-source license has been selected.
