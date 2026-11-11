# Setup decisions

## Reference snapshots

Inspected on 2026-11-11:

- Fumi: `f3963f9dec53b7a205b5094fecc9b6eefa7d59e2`.
- Pateat: `8f8a52fb424962e7ae7e0cccf0764d99fbc67991`.
- Kogane: `b115ad333a383d5a746c0775f3f6c1791218a1fd`.

Reuse shared mise/hk lint conventions and Renovate configuration. Use Fumi's
single-Worker native cf/Vite layout and current coupled Workers test packages.
Use Pateat's aube frozen-install security settings with Bun as lockfile writer.
The cf CLI and Vite plugin are beta dependencies; keep exact versions and update
the build/runtime group together. A monorepo is unnecessary for this scaffold.

The compatibility date is literal in `cloudflare.config.ts` so the shared
Renovate manager can discover it. Local types are generated, not hand-written.
Production observability configuration includes logs and sampled traces.

No mail, finance, extension, domain, credential, or resource configuration from
the reference repositories was copied. No deployment workflow is installed.

## Repository policy

Private repository; issues enabled; wiki and project boards disabled. Squash-only
merges, automatic deletion of merged branches, branch update support, and web
commit signoff follow the reference repositories. Workflow permissions default
to read-only and workflows cannot approve pull requests.

The default-branch ruleset requires a pull request, signed commits, linear
history, and `CI Check`; blocks force pushes and deletion; and allows repository
administrators to bypass only through pull requests. Required approval count is
zero, matching the personal repositories; independent agent review is required
by AGENTS.md. Auto-merge availability is a setting, not authorization to merge.

On 2026-11-11, this private repository's Advanced Security page offered dependency
scanning and Dependabot, but no CodeQL or secret-protection controls. The CodeQL
API returned 403 (not enabled). Those unavailable checks are not required by the
ruleset, and no paid security product was enabled. betterleaks secret scanning
and action-security linting run locally and in CI. Dependency graph, Dependabot
alerts, and automatic security updates are enabled. Actions require full-SHA
pinning at repository level as well as in lint.

Renovate appears in the repository's installed GitHub Apps. Its shared preset and
coupled dependency groups are configured. A future update PR is still a separate
operational event; configuration and installation alone do not prove its creation.

## Local verification

On 2026-11-11, `mise run fix` and `mise run ci` passed in WSL Ubuntu 26.04 with
mise 2026.11.5. The CI task checked all linters, generated types and TypeScript,
four local Workers tests, the production build, built-bundle smoke checks, and
the cf prebuilt upload dry run. The research archive hash remained unchanged.
Independent agent review found no actionable source/configuration issues.

Linux and Windows tool versions are locked. Windows runtime execution has not
been tested; the verified local execution environment is WSL/Linux.
