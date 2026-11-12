import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { execute, operations, parseVideoUrl } from "../src/service.ts";
import { appState, getSettings } from "../src/store.ts";
import { handleApi, handleMcp, mcpTools, routes } from "../src/transport.ts";
import type { Principal } from "../src/model.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const owner: Principal = { userId: "alice", actor: "user:alice", transport: "browser" };
const other: Principal = { userId: "bob", actor: "user:bob", transport: "browser" };
beforeEach(async () => {
  await resetDatabase();
  await seedUser("alice");
  await seedUser("bob");
});
const rule = {
  name: "Synthetic literal",
  priority: 1,
  enabled: true,
  action: "review",
  categoryId: null,
  channelId: null,
  titleIncludes: ["Example"],
  titleExcludes: [],
  descriptionIncludes: [],
  minDurationSeconds: null,
  maxDurationSeconds: null,
  kind: "any",
};
describe("shared per-user application", () => {
  it("reports scoped discovery progress and distinct verified notifications separately from backfill", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret,lease_expires_at,last_reconciled_at) VALUES('alice','ready','synthetic','synthetic',?,?)",
      ).bind(now + 60000, now),
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret,last_reconciled_at,reconcile_cursor) VALUES('alice','partial','synthetic','synthetic',?,'page')",
      ).bind(now),
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret) VALUES('alice','new','synthetic','synthetic')",
      ),
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret,active,last_reconciled_at) VALUES('alice','inactive','synthetic','synthetic',0,?)",
      ).bind(now),
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret,lease_expires_at,last_reconciled_at) VALUES('bob','other','synthetic','synthetic',?,?)",
      ).bind(now + 60000, now),
      env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,published_at,status,discovered_at,updated_at) VALUES('alice','abcdefghijk','ready',?,'added',?,?)",
      ).bind(new Date(now).toISOString(), now, now),
      env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,discovered_at,updated_at) VALUES('alice','backfill123','ready',?,?)",
      ).bind(now, now),
      env.DB.prepare(
        "INSERT INTO audit(user_id,actor,video_id,action,detail,created_at) VALUES('alice','websub','abcdefghijk','websub_received','discovered',?)",
      ).bind(now),
      env.DB.prepare(
        "INSERT INTO audit(user_id,actor,video_id,action,detail,created_at) VALUES('alice','websub','abcdefghijk','websub_received','updated',?)",
      ).bind(now + 1),
      env.DB.prepare(
        "INSERT INTO audit(user_id,actor,video_id,action,detail,created_at) VALUES('bob','websub','private1234','websub_received','validated',?)",
      ).bind(now + 2),
      env.DB.prepare(
        "INSERT INTO operations(user_id,video_id,category_id,playlist_id,kind,state,created_at,updated_at) VALUES('alice','abcdefghijk','music','synthetic','insert','done',?,?)",
      ).bind(now, now + 3),
    ]);
    const state = await appState(env.DB, owner, {});
    expect(state.channels).toEqual({
      total: 3,
      activeWebSub: 1,
      backfillComplete: 1,
      errors: 0,
      backfillFailed: 0,
    });
    expect(state.notifications).toEqual({
      videos: 1,
      lastReceivedAt: now + 1,
      recent: [
        {
          videoId: "abcdefghijk",
          firstReceivedAt: now,
          lastReceivedAt: now + 1,
          discoveredFromNotificationAt: now,
          publishedAt: new Date(now).toISOString(),
          status: "added",
          manualOverride: 0,
          addedAt: now + 3,
        },
      ],
    });
  });
  it("shows scoped reconciliation failures without counting them as completed backfill", async () => {
    const retry = Date.now() + 60000;
    await env.DB.batch(
      ["alice", "bob"].map((uid) =>
        env.DB.prepare(
          "INSERT INTO channels(user_id,id,title,callback_token,hub_secret,last_reconciled_at,reconcile_cursor) VALUES(?,?,'Synthetic','synthetic','synthetic',?,?)",
        ).bind(
          uid,
          uid,
          Date.now(),
          JSON.stringify({
            uploads: "UUexample123",
            page: "same-page",
            error: "youtube_http_404",
            retryAt: retry,
          }),
        ),
      ),
    );
    const state = await appState(env.DB, owner, {});
    expect(state.channels.backfillComplete).toBe(0);
    expect(state.channels.backfillFailed).toBe(1);
    expect(state.collectionErrors).toEqual([
      { channelId: "alice", title: "Synthetic", code: "youtube_http_404", nextAttemptAt: retry },
    ]);
  });
  it("starts paused without personal rules or categories", async () => {
    const state = await appState(env.DB, owner, {});
    expect(state.settings.enabled).toBe(false);
    expect(state.categories).toEqual([]);
    expect(state.rules).toEqual([]);
  });
  it("isolates identical resource IDs and forbids cross-user categories", async () => {
    await execute(env, owner, "categories_save", { id: "shared", name: "Alice" });
    await execute(env, other, "categories_save", { id: "shared", name: "Bob" });
    await execute(env, owner, "categories_save", { id: "only-alice", name: "Private" });
    await expect(
      execute(env, other, "rules_save", {
        ...rule,
        action: "categorize",
        categoryId: "only-alice",
      }),
    ).rejects.toMatchObject({ code: "invalid_category" });
    expect((await appState(env.DB, other, {})).categories.map((c) => c.name)).toEqual(["Bob"]);
    await execute(env, owner, "rules_save", { ...rule, id: "same" });
    expect((await appState(env.DB, other, {})).rules).toEqual([]);
  });
  it("retains manual exclusions and only reevaluates the configured recent window", async () => {
    const recent = new Date().toISOString(),
      old = new Date(Date.now() - 40 * 86400000).toISOString();
    for (const [video, manual, published] of [
      ["abcdefghij1", 1, recent],
      ["abcdefghij2", 0, recent],
      ["abcdefghij3", 0, old],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- Seed fixtures in deterministic order before exercising reevaluation.
      await env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,published_at,status,manual_override,discovered_at,updated_at) VALUES(?,?,'',?,'excluded',?,?,?)",
      )
        .bind("alice", video, published, manual, Date.now(), Date.now())
        .run();
    }
    await execute(env, owner, "rules_save", rule);
    const rows = await env.DB.prepare("SELECT id,status FROM videos ORDER BY id").all<{
      id: string;
      status: string;
    }>();
    expect(rows.results.map((row) => row.status)).toEqual(["excluded", "pending", "excluded"]);
  });
  it("checks version and prevents another user mutating a candidate", async () => {
    await execute(env, owner, "videos_add", { url: "https://youtube.com/shorts/abcdefghijk" });
    await expect(
      execute(env, other, "videos_update", { id: "abcdefghijk", version: 0, action: "exclude" }),
    ).rejects.toMatchObject({ status: 404 });
    await execute(env, owner, "videos_update", {
      id: "abcdefghijk",
      version: 0,
      action: "exclude",
    });
    await expect(
      execute(env, owner, "videos_update", { id: "abcdefghijk", version: 0, action: "reset" }),
    ).rejects.toMatchObject({ status: 409 });
    const state = await appState(env.DB, owner, {});
    expect(state.videos[0]?.manualOverride).toBe(true);
  });
  it("keeps series progress explicit and prevents changing a registered playlist identity", async () => {
    await execute(env, owner, "categories_save", { id: "series", name: "Series" });
    await execute(env, owner, "series_save", {
      id: "watch",
      name: "Example",
      playlistId: "PLsynthetic1234",
      mode: "hold",
      categoryId: null,
    });
    await execute(env, owner, "series_save", {
      id: "watch",
      name: "Example",
      playlistId: "PLsynthetic1234",
      mode: "follow",
      categoryId: "series",
    });
    expect((await appState(env.DB, owner, {})).series[0]?.mode).toBe("follow");
    await expect(
      execute(env, owner, "series_save", {
        id: "watch",
        name: "Example",
        playlistId: "PLdifferent1234",
        mode: "hold",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("offers every UI operation via MCP and returns the same settings effects", async () => {
    const tools = mcpTools() as { name: string }[];
    expect(new Set(routes.map((r) => r.operation))).toEqual(new Set(operations));
    expect(tools.map((t) => t.name)).toEqual(operations.map((o) => `suguri_${o}`));
    const csrf = (await appState(env.DB, owner, {})).csrfToken;
    const browser = await handleApi(
      new Request(`${env.APP_ORIGIN}/api/settings`, {
        method: "POST",
        headers: {
          Origin: env.APP_ORIGIN,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ backfillDays: 30 }),
      }),
      env,
      owner,
    );
    expect(browser.status).toBe(200);
    expect((await getSettings(env.DB, "alice")).backfillDays).toBe(30);
    const mcp = await handleMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "suguri_settings", arguments: { backfillDays: 7 } },
        }),
      }),
      env,
      { ...owner, transport: "mcp" },
    );
    expect(await mcp.json()).toMatchObject({ result: { isError: false } });
    expect((await getSettings(env.DB, "alice")).backfillDays).toBe(7);
    expect((await getSettings(env.DB, "bob")).backfillDays).toBe(7);
  });
  it("rejects cross-origin browser and MCP writes", async () => {
    await expect(
      handleApi(
        new Request(`${env.APP_ORIGIN}/api/settings`, {
          method: "POST",
          headers: { Origin: "https://evil.invalid", "Content-Type": "application/json" },
          body: "{}",
        }),
        env,
        owner,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handleMcp(
        new Request(`${env.APP_ORIGIN}/mcp`, {
          method: "POST",
          headers: { Origin: "https://evil.invalid" },
        }),
        env,
        owner,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("does not interpret attacker URL hosts as YouTube", () => {
    expect(parseVideoUrl("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    for (const url of [
      "https://youtube.com.evil.invalid/watch?v=abcdefghijk",
      "https://youtube.com@evil.invalid/abcdefghijk",
      "http://youtu.be/abcdefghijk",
    ]) {
      expect(() => parseVideoUrl(url)).toThrow();
    }
  });
});
