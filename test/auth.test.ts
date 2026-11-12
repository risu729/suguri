import { env } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticate,
  finishOAuth,
  getAccessToken,
  seal,
  startOAuth,
  unseal,
} from "../src/auth.ts";
import { hash, HttpError } from "../src/util.ts";
import { oauthFailureCode } from "../src/errors.ts";
import { resetDatabase, seedUser } from "./helpers.ts";
import type { Principal } from "../src/model.ts";
import { execute } from "../src/service.ts";
import { appState } from "../src/store.ts";

beforeEach(resetDatabase);
describe("Access identity and Google authorization", () => {
  it.each([false, true])(
    "constructs Workers requests and rejects token redirects: %s",
    async (redirect) => {
      await seedUser("alice");
      const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
      const start = await startOAuth(env, principal);
      const location = new URL(start.headers.get("Location")!);
      const request = new Request(
        `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`,
        { headers: { Cookie: start.headers.get("Set-Cookie")!.split(";")[0]! } },
      );
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const outbound = new Request(input, init);
        expect(outbound.redirect).toBe("manual");
        if (outbound.url === "https://oauth2.googleapis.com/token") {
          if (redirect)
            return new Response(null, {
              status: 302,
              headers: { Location: "https://untrusted.example.invalid/" },
            });
          return Response.json({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/youtube.force-ssl",
          });
        }
        expect(outbound.url).toBe(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        );
        return Response.json({
          items: [{ id: `UC${"a".repeat(22)}`, snippet: { title: "Synthetic" } }],
        });
      });
      if (redirect) {
        await expect(finishOAuth(request, env, principal, fetcher)).rejects.toMatchObject({
          code: "google_token_http_302",
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(await env.DB.prepare("SELECT count(*) AS n FROM connection").first()).toMatchObject({
          n: 0,
        });
      } else {
        expect((await finishOAuth(request, env, principal, fetcher)).status).toBe(302);
        expect(fetcher).toHaveBeenCalledTimes(2);
        await env.DB.prepare("UPDATE connection SET expires_at=0 WHERE user_id='alice'").run();
        expect(await getAccessToken(env, "alice", fetcher)).toBe("synthetic-access");
        expect(fetcher).toHaveBeenCalledTimes(3);
      }
    },
  );

  it("only exposes allowlisted connection failure codes", () => {
    expect(oauthFailureCode(new Error("synthetic-secret"))).toBe("failed");
    expect(oauthFailureCode(new HttpError(502, "synthetic-secret"))).toBe("failed");
    expect(oauthFailureCode(new HttpError(502, "google_token_http_400"))).toBe(
      "google_token_http_400",
    );
    expect(oauthFailureCode(new HttpError(502, "google_token_http_400_secret"))).toBe("failed");
    expect(oauthFailureCode(new HttpError(400, "invalid_oauth_state"))).toBe("invalid_oauth_state");
  });

  it.each([
    ["invalid_client", "google_client_invalid"],
    ["invalid_grant", "reconnect_required"],
    ["secret-provider-detail", "google_token_http_400"],
  ])(
    "classifies token exchange failure %s without returning provider details",
    async (providerError, expected) => {
      await seedUser("alice");
      const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
      const start = await startOAuth(env, principal);
      const location = new URL(start.headers.get("Location")!);
      const request = new Request(
        `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`,
        {
          headers: { Cookie: start.headers.get("Set-Cookie")!.split(";")[0]! },
        },
      );
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: providerError, error_description: "synthetic-secret" },
            { status: 400 },
          ),
        );
      await expect(finishOAuth(request, env, principal, fetcher)).rejects.toMatchObject({
        code: expected,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("distinguishes a channel rejected by YouTube from a token exchange failure", async () => {
    await seedUser("alice");
    const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
    const start = await startOAuth(env, principal);
    const location = new URL(start.headers.get("Location")!);
    const request = new Request(
      `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`,
      {
        headers: { Cookie: start.headers.get("Set-Cookie")!.split(";")[0]! },
      },
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.force-ssl",
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              errors: [{ reason: "youtubeSignupRequired", message: "synthetic-private-detail" }],
            },
          },
          { status: 401 },
        ),
      );
    await expect(finishOAuth(request, env, principal, fetcher)).rejects.toMatchObject({
      code: "youtube_channel_unavailable",
    });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM connection").first()).toMatchObject({
      n: 0,
    });
  });

  it("serializes disconnect against an in-flight OAuth exchange", async () => {
    await seedUser("alice");
    const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
    const start = await startOAuth(env, principal),
      location = new URL(start.headers.get("Location")!);
    const request = new Request(
      `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`,
      { headers: { Cookie: start.headers.get("Set-Cookie")!.split(";")[0]! } },
    );
    let release: (value: Response) => void = () => undefined;
    let signal: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => {
        signal();
        return held;
      })
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: `UC${"a".repeat(22)}`, snippet: { title: "Synthetic" } }] }),
      );
    const pending = finishOAuth(request, env, principal, fetcher);
    await entered;
    await expect(execute(env, principal, "disconnect", {})).rejects.toMatchObject({
      status: 409,
      code: "busy",
    });
    release(
      Response.json({
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/youtube.force-ssl",
      }),
    );
    await pending;
    await execute(env, principal, "disconnect", {});
    expect(await appState(env.DB, principal, {})).toMatchObject({
      connected: false,
      reconnectRequired: false,
    });
    await expect(finishOAuth(request, env, principal, fetcher)).rejects.toMatchObject({
      code: "invalid_oauth_state",
    });
  });
  it("verifies signature/audience and keys accounts by Access subject, never email", async () => {
    const pair = await generateKeyPair("RS256"),
      key = await exportJWK(pair.publicKey);
    key.kid = "test";
    const keys = createLocalJWKSet({ keys: [key] });
    const sign = (sub: string, audience = env.ACCESS_AUDIENCE) =>
      new SignJWT({ type: "app", email: "same@example.invalid" })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setSubject(sub)
        .setIssuer(env.ACCESS_ISSUER)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
    const request = async (sub: string, audience?: string) =>
      new Request(env.APP_ORIGIN, {
        headers: { "cf-access-jwt-assertion": await sign(sub, audience) },
      });
    const a = await authenticate(await request("alice"), env, "browser", keys),
      b = await authenticate(await request("bob"), env, "browser", keys);
    expect(a.userId).not.toBe(b.userId);
    await expect(
      authenticate(await request("alice", "wrong"), env, "browser", keys),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticate(
        new Request(env.APP_ORIGIN, {
          headers: { "cf-access-authenticated-user-email": "same@example.invalid" },
        }),
        env,
        "browser",
        keys,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("requires explicit service-to-user mapping for MCP and refuses service browser sessions", async () => {
    const pair = await generateKeyPair("RS256"),
      key = await exportJWK(pair.publicKey);
    key.kid = "service";
    const keys = createLocalJWKSet({ keys: [key] });
    const token = await new SignJWT({ type: "app", common_name: "synthetic-service" })
      .setProtectedHeader({ alg: "RS256", kid: "service" })
      .setIssuer(env.ACCESS_ISSUER)
      .setAudience(env.ACCESS_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
    const request = new Request(env.APP_ORIGIN, { headers: { "cf-access-jwt-assertion": token } });
    await expect(authenticate(request, env, "mcp", keys)).rejects.toMatchObject({ status: 401 });
    const configured = {
      ...env,
      MCP_USERS: JSON.stringify({ "service:synthetic-service": "user:alice" }),
    };
    const principal = await authenticate(request, configured, "mcp", keys);
    expect(principal.userId).toBe(await hash(`${env.ACCESS_ISSUER}|user:alice`));
    await expect(authenticate(request, configured, "browser", keys)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("binds encrypted tokens to their owning user", async () => {
    const value = await seal(env, "alice", "synthetic-token");
    expect(value).not.toContain("synthetic-token");
    expect(await unseal(env, "alice", value)).toBe("synthetic-token");
    await expect(unseal(env, "bob", value)).rejects.toThrow();
  });
  it("rejects OAuth state from another browser or another Access user before any provider call", async () => {
    await seedUser("alice");
    await seedUser("bob");
    const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
    const response = await startOAuth(env, principal),
      location = new URL(response.headers.get("Location")!),
      cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.force-ssl",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const url = `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`;
    const fetcher = vi.fn<typeof fetch>();
    await expect(finishOAuth(new Request(url), env, principal, fetcher)).rejects.toMatchObject({
      code: "invalid_oauth_state",
    });
    await expect(
      finishOAuth(
        new Request(url, { headers: { Cookie: cookie } }),
        env,
        { ...principal, userId: "bob" },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "invalid_oauth_state" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("consumes a valid OAuth state once and stores only encrypted tokens", async () => {
    await seedUser("alice");
    const principal: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
    const start = await startOAuth(env, principal),
      location = new URL(start.headers.get("Location")!),
      cookie = start.headers.get("Set-Cookie")!.split(";")[0]!;
    const request = new Request(
      `${env.APP_ORIGIN}/auth/callback?state=${location.searchParams.get("state")}&code=synthetic-code`,
      { headers: { Cookie: cookie } },
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.force-ssl",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: `UC${"a".repeat(22)}`, snippet: { title: "Synthetic" } }] }),
      );
    expect((await finishOAuth(request, env, principal, fetcher)).status).toBe(302);
    const row = await env.DB.prepare(
      "SELECT refresh_token FROM connection WHERE user_id='alice'",
    ).first<{ refresh_token: string }>();
    expect(row?.refresh_token).not.toContain("synthetic-refresh");
    expect(await getAccessToken(env, "alice", fetcher)).toBe("synthetic-access");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(finishOAuth(request, env, principal, fetcher)).rejects.toMatchObject({
      code: "invalid_oauth_state",
    });
  });
});
