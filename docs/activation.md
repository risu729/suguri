# Activation and acceptance

The source implementation and local synthetic tests do not connect a Google
account, create production resources, deploy a Worker, or modify real playlists.
Keep automatic processing paused until the following operator-led setup and
bounded acceptance test are complete. The personal installation uses
`https://suguri.takuk.me`; deployment does not imply Google authorization.

## Cloudflare setup

1. Choose an HTTPS application origin and the intended Cloudflare account.
2. Create/bind the D1 database named `suguri-catalog`, and apply
   `migrations/0001_catalog.sql` to that exact database. Inspect native cf's plan
   and resource IDs before accepting provisioning. A build alone does not apply
   database migrations or prove a binding works.
3. Configure the Worker custom domain, its five-minute Cron trigger, and the
   resource plan/cost. `workersDev` and preview URLs remain disabled.
4. Protect the administration, `/api/*`, `/auth/*`, and `/mcp` with Cloudflare
   Access. The hub must reach `/websub/*` without an Access browser challenge;
   those callbacks have their own capability and HMAC validation. Never bypass
   Access for the API or OAuth routes to make callback delivery work.
5. Store the settings below as Worker secrets. Do not paste them into issues,
   command output, chat, committed config, or screenshots.
6. Review edge/proxy/Access request logging: OAuth codes and WebSub capability
   tokens appear in URLs. Worker automatic request observability is disabled.
   The application uses a redacted D1 operation ledger.

| Secret | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact HTTPS origin, without trailing slash |
| `ACCESS_ISSUER` | Exact `https://TEAM.cloudflareaccess.com` issuer |
| `ACCESS_AUDIENCE` | Access application's audience tag |
| `MCP_USERS` | JSON service-identity to Access-user mapping, or `{}` |
| `GOOGLE_CLIENT_ID` | Dedicated Web application OAuth client |
| `GOOGLE_CLIENT_SECRET` | That client's secret |
| `ENCRYPTION_KEY` | Base64-encoded cryptographically random 32-byte key |

Keep the encryption key backed up securely. Rotating it requires decrypting and
reencrypting existing stored tokens; simply replacing it makes them unreadable.
Service mappings use keys `service:<verified common_name>` and values
`user:<Access subject>`. Obtain identifiers from the actual verified setup, not
from guessed email addresses. A service mapping is a deliberate grant to one
user's Suguri data. The deployment must prove the intended MCP login/gateway
delivers a valid Access assertion; this code does not implement a separate OAuth
authorization server for MCP clients.

The manually dispatched Deploy workflow accepts only current `main`, runs CodeQL
and the full CI checks, then deploys the checked Worker at 100% traffic. It uses
the protected `production` environment's `CLOUDFLARE_API_TOKEN` secret and
`CLOUDFLARE_ACCOUNT_ID` / `SUGURI_CATALOG_DATABASE_ID` variables. The deployment
token must be account-owned and restricted to this Worker's script tag with
Individual Workers Editor. Database provisioning/migrations and custom-domain/Cron
updates use the separately authorized bootstrap procedure; the deploy action has
`deploy-triggers: false`. Local `mise run ci` and its upload dry run do not deploy.

The initial release may omit both Google client secrets until a dedicated client
is ready. Google connection then returns `not_configured`, and processing remains
paused with no connected accounts. Never install fake Google credentials merely
to make a deployment check pass.

## Google setup and user action

1. In the intended Google Cloud project, enable YouTube Data API v3 and inspect
   the actual quota allocation. Cloudflare remains the program's runtime.
2. Configure the consent screen and a Web application OAuth client. Register
   the exact redirect URI `APP_ORIGIN/auth/callback` (replace `APP_ORIGIN` with
   the chosen origin, not the literal text).
   Use `/info/about` for the homepage and `/info/privacy` for the privacy policy.
   Configure a narrowly scoped Access application for `/info/*`; these routes
   serve static public information only. Keep all administration, API, OAuth and
   MCP routes protected. The public homepage describes this personal installation;
   review its disclosures before offering the service to anyone else.
3. Review the consent screen's publishing mode. External/Testing refresh tokens
   for these scopes can expire after seven days. Continuous use needs the
   appropriate publishing/verification setup; personal use has a documented
   verification exception, which is distinct from being a verified public app.
4. Sign in to Suguri through Cloudflare Access. Use its Google connection action
   and personally complete Google's account/channel selection and consent.
   Passwords, one-time codes, and consent cannot be supplied by the application or MCP.
5. Confirm that Suguri displays the intended connected channel. The requested
   `youtube.force-ssl` scope permits more than one playlist; Suguri's code enforces
   owned private destinations. This is not a playlist-scoped Google permission.
6. Create categories in the UI or MCP, then create/attach an owned private
   playlist for each. Configure personal channel/rule/series preferences in the
   database through those same operations. No personal defaults are committed.

Disconnect forgets local tokens, deactivates collection, and pauses automation.
It keeps the Access account, rules, and catalog. Revoke the Google-side grant in
[Google account permissions](https://security.google.com/settings/security/permissions)
when desired. Changing to a different YouTube channel is deliberately blocked
while old mappings exist; a reviewed data/mapping migration is required.

## Bounded real-account acceptance

- Verify Access denial without valid authentication, issuer/audience rejection,
  and isolation between two synthetic or operator-approved accounts.
- Complete consent, check encrypted token storage without printing token values,
  and verify refresh/reconnect and disconnect behavior.
- Synchronize a small channel set. Verify the real hub accepts the requested
  secret and produces the expected signed Atom payload. Missing/invalid signatures
  must fail closed. Verify a persisted challenge lease and a real new notification.
- Verify recovery discovery against the channel's actual uploads playlist.
- Preview explicit rules against a small recent set. Confirm thumbnails/titles/
  channels, manual override retention, 7/30-day behavior, and series mode changes.
- Use a newly created private test playlist and a small insertion budget. Verify
  the real added item, destination privacy/ownership, a manual category move,
  exclusion, and an externally deleted item's suppression. These writes require
  the owner's explicit authorization for the bounded acceptance test.
- Verify the actual MCP client can authenticate through Access and call the same
  read/write operations with the same results and per-user restrictions.
- Observe several scheduled passes and failure/retry states before enabling
  unattended operation. A successful deploy, HTTP200, or local fixture is not
  evidence of real notification delivery or playlist writes.

Before offering access beyond a personal installation, publish accurate privacy
and deletion/contact information, establish retention for all provider data and
backups, and verify Google/Cloudflare quotas and account limits for that scale.

## Sources

- [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Personal-use verification exceptions](https://support.google.com/cloud/answer/13464323)
- [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
