import { appOrigin, authenticate, finishOAuth, startOAuth } from "./auth.ts";
import { publicFailure } from "./errors.ts";
import { runPipeline } from "./pipeline.ts";
import { expireMetadata } from "./maintenance.ts";
import { handleApi, handleMcp } from "./transport.ts";
import { renderApp } from "./ui.ts";
import { HttpError, json, randomToken } from "./util.ts";
import { handleWebSub } from "./websub.ts";
import { publicInfo } from "./public-info.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      const info = publicInfo(request);
      if (info) return info;
      if (path === "/health") {
        if (!["GET", "HEAD"].includes(request.method))
          return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
        return new Response(
          request.method === "HEAD"
            ? null
            : JSON.stringify({
                service: "suguri",
                status: "implemented",
                productionVerified: false,
              }),
          { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
        );
      }
      if (path.startsWith("/websub/")) return await handleWebSub(request, env);
      if (path === "/" && request.method === "GET") {
        const nonce = randomToken();
        return new Response(renderApp(nonce), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src https://i.ytimg.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
          },
        });
      }
      if (!path.startsWith("/api/") && !path.startsWith("/auth/") && path !== "/mcp")
        throw new HttpError(404, "not_found");
      const principal = await authenticate(request, env, path === "/mcp" ? "mcp" : "browser");
      if (path === "/mcp") return await handleMcp(request, env, principal);
      if (path === "/auth/start" && request.method === "GET")
        return await startOAuth(env, principal);
      if (path === "/auth/callback" && request.method === "GET") {
        try {
          return await finishOAuth(request, env, principal);
        } catch {
          const cancelled = new URL(request.url).searchParams.get("error") === "access_denied";
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${appOrigin(env)}/?connection_error=${cancelled ? "cancelled" : "failed"}`,
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
              "Set-Cookie":
                "__Host-suguri-oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
            },
          });
        }
      }
      return await handleApi(request, env, principal);
    } catch (error) {
      const failure = publicFailure(error);
      return json({ error: failure.error }, failure.status);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await expireMetadata(env.DB);
    const users = await env.DB.prepare(
      "SELECT c.user_id FROM connection c JOIN settings s ON s.user_id=c.user_id WHERE c.reconnect_required=0 ORDER BY coalesce(s.last_run_at,0) LIMIT 2",
    ).all<{ user_id: string }>();
    for (const user of users.results) {
      // oxlint-disable-next-line no-await-in-loop -- Bound per-invocation provider load and preserve user fairness.
      await runPipeline(env, user.user_id).catch(() => undefined);
    }
  },
} satisfies ExportedHandler<Env>;
