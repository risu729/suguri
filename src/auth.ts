import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Principal } from "./model.ts";
import { acquireLease, ensureUser, releaseLease, withLease } from "./store.ts";
import { base64url, boundedText, hash, HttpError, randomToken, record, unbase64 } from "./util.ts";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function appOrigin(env: Env): string {
  try {
    const url = new URL(env.APP_ORIGIN);
    if (url.protocol !== "https:" || url.origin !== env.APP_ORIGIN) throw new Error();
    return url.origin;
  } catch {
    throw new HttpError(503, "not_configured");
  }
}
export async function authenticate(
  request: Request,
  env: Env,
  transport: "browser" | "mcp",
  testKeys?: JWTVerifyGetKey,
): Promise<Principal> {
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) ||
    !env.ACCESS_AUDIENCE
  )
    throw new HttpError(503, "auth_not_configured");
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 16384) throw new HttpError(401, "unauthorized");
  let keys: JWTVerifyGetKey | undefined = testKeys ?? keySets.get(env.ACCESS_ISSUER);
  if (!keys) {
    const remote = createRemoteJWKSet(new URL(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
    });
    if (keySets.size >= 4) keySets.clear();
    keySets.set(env.ACCESS_ISSUER, remote);
    keys = remote;
  }
  let actor: string, subject: string;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat"],
    });
    if (payload["type"] !== "app") throw new Error();
    const service = payload["common_name"];
    if (typeof service === "string" && service) {
      if (transport !== "mcp") throw new Error();
      actor = `service:${service}`;
      const mappings = record(JSON.parse(env.MCP_USERS || "{}"));
      const mapped = mappings[actor];
      if (typeof mapped !== "string" || !mapped.startsWith("user:") || mapped.length > 300)
        throw new Error();
      subject = mapped;
    } else if (
      typeof payload.sub === "string" &&
      payload.sub.length > 0 &&
      payload.sub.length <= 256
    ) {
      actor = `user:${payload.sub}`;
      subject = actor;
    } else throw new Error();
  } catch {
    throw new HttpError(401, "unauthorized");
  }
  const userId = await hash(`${env.ACCESS_ISSUER}|${subject}`);
  await ensureUser(env.DB, userId);
  return { userId, actor, transport };
}
export async function checkCsrf(request: Request, env: Env, userId: string): Promise<void> {
  if (request.headers.get("Origin") !== appOrigin(env)) throw new HttpError(403, "csrf");
  const row = await env.DB.prepare("SELECT csrf_token FROM users WHERE id=?")
    .bind(userId)
    .first<{ csrf_token: string }>();
  if (
    !row ||
    (await hash(request.headers.get("X-CSRF-Token") ?? "")) !== (await hash(row.csrf_token))
  )
    throw new HttpError(403, "csrf");
}
async function encryptionKey(env: Env): Promise<CryptoKey> {
  try {
    const bytes = unbase64(env.ENCRYPTION_KEY);
    if (bytes.length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new HttpError(503, "encryption_not_configured");
  }
}
export async function seal(env: Env, userId: string, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(env),
    new TextEncoder().encode(value),
  );
  return `${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function unseal(env: Env, userId: string, value: string): Promise<string> {
  const parts = value.split(".");
  if (parts.length !== 2) throw new HttpError(503, "token_unreadable");
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unbase64(parts[0]!),
          additionalData: new TextEncoder().encode(userId),
        },
        await encryptionKey(env),
        unbase64(parts[1]!),
      ),
    );
  } catch {
    throw new HttpError(503, "token_unreadable");
  }
}
async function googleJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(502, "google_unavailable");
  }
  let value: Record<string, unknown>;
  try {
    value = record(JSON.parse(await boundedText(response.body)));
  } catch {
    throw new HttpError(502, "invalid_google_response");
  }
  if (!response.ok) {
    const error = value["error"];
    if (error === "invalid_grant") throw new HttpError(401, "reconnect_required");
    if (error === "invalid_client") throw new HttpError(503, "google_client_invalid");
    let reason: unknown;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const details = (error as Record<string, unknown>)["errors"];
      if (Array.isArray(details) && details[0] && typeof details[0] === "object")
        reason = (details[0] as Record<string, unknown>)["reason"];
    }
    if (reason === "accessNotConfigured") throw new HttpError(503, "youtube_api_disabled");
    if (reason === "youtubeSignupRequired") throw new HttpError(403, "youtube_channel_unavailable");
    if (reason === "forbidden") throw new HttpError(403, "youtube_access_denied");
    const stage = url.startsWith("https://www.googleapis.com/youtube/") ? "channel" : "token";
    throw new HttpError(502, `google_${stage}_http_${response.status}`);
  }
  return value;
}
function tokenValue(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 8192)
    throw new HttpError(502, "invalid_google_response");
  return value;
}
function expiration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 60 || value > 86400)
    throw new HttpError(502, "invalid_google_response");
  return Date.now() + value * 1000;
}
function oauthConfig(env: Env): void {
  appOrigin(env);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    throw new HttpError(503, "not_configured");
}
export async function startOAuth(env: Env, principal: Principal): Promise<Response> {
  oauthConfig(env);
  await encryptionKey(env);
  const state = randomToken(),
    browser = randomToken(),
    verifier = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE user_id=? OR expires_at<?").bind(
      principal.userId,
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO oauth_states(state_hash,user_id,verifier,browser_hash,expires_at) VALUES(?,?,?,?,?)",
    ).bind(
      await hash(state),
      principal.userId,
      await seal(env, principal.userId, verifier),
      await hash(browser),
      Date.now() + 600000,
    ),
  ]);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const params = {
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${appOrigin(env)}/auth/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.force-ssl",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await hash(verifier),
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `__Host-suguri-oauth=${browser}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}
export async function finishOAuth(
  request: Request,
  env: Env,
  principal: Principal,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  oauthConfig(env);
  const url = new URL(request.url),
    state = url.searchParams.get("state") ?? "",
    code = url.searchParams.get("code");
  const browser =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("__Host-suguri-oauth="))
      ?.slice(20) ?? "";
  if (!state || state.length > 100 || !code || code.length > 4096 || !browser)
    throw new HttpError(400, "invalid_oauth_state");
  return withLease(env.DB, principal.userId, async () => {
    const row = await env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND user_id=? AND browser_hash=? AND expires_at>? RETURNING verifier",
    )
      .bind(await hash(state), principal.userId, await hash(browser), Date.now())
      .first<{ verifier: string }>();
    if (!row) throw new HttpError(400, "invalid_oauth_state");
    const result = await googleJson(fetcher, "https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: `${appOrigin(env)}/auth/callback`,
        grant_type: "authorization_code",
        code_verifier: await unseal(env, principal.userId, row.verifier),
      }),
    });
    if (
      typeof result["scope"] !== "string" ||
      !result["scope"].split(" ").includes("https://www.googleapis.com/auth/youtube.force-ssl")
    )
      throw new HttpError(403, "youtube_scope_required");
    const access = tokenValue(result["access_token"]),
      refresh = tokenValue(result["refresh_token"]),
      expires = expiration(result["expires_in"]);
    const channels = await googleJson(
      fetcher,
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${access}` } },
    );
    if (!Array.isArray(channels["items"]) || channels["items"].length !== 1)
      throw new HttpError(400, "youtube_channel_required");
    const channel = record(channels["items"][0]),
      snippet = record(channel["snippet"]);
    const channelId = tokenValue(channel["id"]),
      title = tokenValue(snippet["title"]);
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))
      throw new HttpError(502, "invalid_google_response");
    const existing = await env.DB.prepare("SELECT channel_id FROM connection WHERE user_id=?")
      .bind(principal.userId)
      .first<{ channel_id: string }>();
    const mappings = await env.DB.prepare(
      "SELECT count(*) AS n FROM categories WHERE user_id=? AND playlist_id IS NOT NULL",
    )
      .bind(principal.userId)
      .first<{ n: number }>();
    if ((existing && existing.channel_id !== channelId) || (!existing && mappings?.n))
      throw new HttpError(409, "channel_change_requires_migration");
    await env.DB.prepare(
      "INSERT INTO connection(user_id,channel_id,channel_title,refresh_token,access_token,expires_at,connected_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET channel_id=excluded.channel_id,channel_title=excluded.channel_title,refresh_token=excluded.refresh_token,access_token=excluded.access_token,expires_at=excluded.expires_at,reconnect_required=0,connected_at=excluded.connected_at",
    )
      .bind(
        principal.userId,
        channelId,
        title,
        await seal(env, principal.userId, refresh),
        await seal(env, principal.userId, access),
        expires,
        Date.now(),
      )
      .run();
    await env.DB.prepare(
      "UPDATE settings SET last_sync_at=NULL,sync_cursor=NULL,sync_in_progress=0 WHERE user_id=?",
    )
      .bind(principal.userId)
      .run();
    return new Response(null, {
      status: 302,
      headers: {
        Location: appOrigin(env),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": "__Host-suguri-oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  });
}
export async function getAccessToken(
  env: Env,
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const read = () =>
    env.DB.prepare(
      "SELECT access_token,refresh_token,expires_at,reconnect_required FROM connection WHERE user_id=?",
    )
      .bind(userId)
      .first<{
        access_token: string;
        refresh_token: string;
        expires_at: number;
        reconnect_required: number;
      }>();
  let row = await read();
  if (!row || row.reconnect_required) throw new HttpError(401, "reconnect_required");
  if (row.expires_at > Date.now() + 60000) return unseal(env, userId, row.access_token);
  const name = `${userId}:refresh`,
    owner = await acquireLease(env.DB, name, 30000);
  if (!owner) throw new HttpError(409, "token_refresh_busy");
  try {
    row = await read();
    if (!row || row.reconnect_required) throw new HttpError(401, "reconnect_required");
    if (row.expires_at > Date.now() + 60000) return unseal(env, userId, row.access_token);
    const result = await googleJson(fetcher, "https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: await unseal(env, userId, row.refresh_token),
        grant_type: "refresh_token",
      }),
    });
    const access = tokenValue(result["access_token"]);
    await env.DB.prepare(
      "UPDATE connection SET access_token=?,expires_at=?,refresh_token=? WHERE user_id=?",
    )
      .bind(
        await seal(env, userId, access),
        expiration(result["expires_in"]),
        result["refresh_token"]
          ? await seal(env, userId, tokenValue(result["refresh_token"]))
          : row.refresh_token,
        userId,
      )
      .run();
    return access;
  } catch (error) {
    if (error instanceof HttpError && error.code === "reconnect_required")
      await env.DB.prepare("UPDATE connection SET reconnect_required=1 WHERE user_id=?")
        .bind(userId)
        .run();
    throw error;
  } finally {
    await releaseLease(env.DB, name, owner);
  }
}
