import { randomToken } from "./util.ts";

const about = `<h1>Suguri</h1>
<p>Suguri helps its operator select new videos from YouTube subscriptions and organize them into owned, private playlists.</p>
<p>Rules can assign videos to a category, exclude them, or leave them in an Inbox for manual review. The operator can correct decisions and organize videos and stream archives at their own pace.</p>
<p>This installation is for personal use. Access to the application, its settings, and its data is restricted to the installation operator. Google authorization connects a YouTube channel separately from application sign-in.</p>
<h2>Google and YouTube data</h2>
<p>With permission, Suguri reads the connected channel, subscriptions, video metadata, and playlists. It creates private destination playlists and manages their items as requested. It does not retrieve watch history or playback progress.</p>
<p><a href="/info/privacy">Read the privacy policy</a> before connecting Google. The permission Google displays is broader than one playlist; Suguri checks that destinations are owned and private.</p>
<p><a href="/">Open Suguri</a> · <a href="https://github.com/risu729/suguri">Source and project information</a></p>`;

const privacy = `<h1>Suguri privacy policy</h1>
<p>Updated November 12, 2026. This policy describes the personal Suguri installation at suguri.takuk.me.</p>
<h2>Data accessed and stored</h2>
<p>Suguri uses Google authorization to access the connected YouTube channel, subscriptions, video identifiers and metadata, and playlists and their items. It stores these records together with categories, rules, manual decisions, processing receipts, and limited operation logs. It does not read watch history or playback progress.</p>
<p>Access and refresh tokens are encrypted by the application before storage in Cloudflare D1. Application sign-in uses Cloudflare Access; a derived user identifier associates the operator with their Suguri records. Temporary authorization state and browser cookies support secure sign-in and connection.</p>
<h2>Purpose and providers</h2>
<p>These data are used to discover subscribed videos, display the Inbox, apply the operator's selection rules, maintain owned private playlists, and recover from failed operations. Suguri's use of Google data is limited to this user-facing functionality and follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
<p>Cloudflare hosts the application and database and provides access control. Google and YouTube receive the API requests needed for the requested features. Thumbnails are loaded from YouTube. The application does not sell Google user data, use it for advertising, or send it to AI providers. Connected MCP clients can access application data and actions only when the operator authorizes their access.</p>
<h2>Retention and control</h2>
<p>Video display metadata is refreshed during processing. Stored titles, descriptions, thumbnails, and duration metadata older than 29 days are cleared by scheduled maintenance if they have not been refreshed. Rules, decisions, identifiers, playlist mappings, and operation records remain until removed by the operator; they are not all deleted by that metadata maintenance.</p>
<p>Disconnecting Google clears locally stored access and refresh tokens and pauses collection and automation. It retains the catalog and personal settings and does not revoke the Google-side permission or delete YouTube playlists. You can revoke the permission separately in <a href="https://myaccount.google.com/connections">Google Account connections</a> and manage playlists directly on YouTube.</p>
<p>For questions or deletion of application records, contact the installation operator using the support email displayed on the Google consent screen. The operator administers this personal installation and its database. Provider-managed backups and access logs follow the providers' configured retention; disconnecting is not an immediate purge of those backups or logs.</p>
<h2>Other policies</h2>
<p>Suguri uses YouTube API Services. See the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and <a href="https://policies.google.com/privacy">Google Privacy Policy</a>. This policy will be updated if the installation's data use changes.</p>
<p><a href="/info/about">About Suguri</a> · <a href="/">Open Suguri</a></p>`;

export function publicInfo(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  const content = path === "/info/about" ? about : path === "/info/privacy" ? privacy : null;
  if (content === null) return null;
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const nonce = randomToken();
  return new Response(
    request.method === "HEAD"
      ? null
      : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${path === "/info/about" ? "Suguri" : "Privacy — Suguri"}</title><style nonce="${nonce}">body{max-width:740px;margin:48px auto;padding:0 24px;font:17px/1.7 system-ui,sans-serif;color:#23362d;background:#f7f8f3}h1,h2{line-height:1.25}h2{margin-top:2em}a{color:#246345;text-underline-offset:3px}a:focus-visible{outline:3px solid #c08a27}</style></head><body><main>${content}</main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      },
    },
  );
}
