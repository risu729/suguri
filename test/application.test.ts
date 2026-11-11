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
