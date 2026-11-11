# Suguri

Select videos from YouTube subscriptions and collect them in a private playlist.
The name comes from the Japanese word *yorisuguri*: carefully selected.

## Status

Development setup is implemented: a local Cloudflare Worker, locked tools,
formatters, linters, runtime tests, build verification, and GitHub CI. The only
HTTP endpoint is `GET /health` (also `HEAD`), which reports `status: scaffold`.

WebSub ingestion, OAuth, subscription synchronization, filtering, and playlist
writes are planned. No Google account or Cloudflare resource is connected.

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

- [Current architecture and open decisions](docs/architecture.md)
- [Research archive and provenance](docs/research/README.md)
- [Setup decisions and reference repositories](docs/setup.md)
- [Implementation backlog](docs/backlog.md)

This is a public repository. No open-source license has been selected.
