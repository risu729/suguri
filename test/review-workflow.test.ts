import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { execute } from "../src/service.ts";
import { appState } from "../src/store.ts";
import type { Principal } from "../src/model.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const alice: Principal = { userId: "alice", actor: "test", transport: "mcp" };
const bob: Principal = { ...alice, userId: "bob" };
const first = "abcdefghij1",
  second = "abcdefghij2";
const items = [
  { id: first, version: 0 },
  { id: second, version: 0 },
];
beforeEach(async () => {
  await resetDatabase();
  await seedUser("alice");
  await seedUser("bob");
  await execute(env, alice, "videos_add", { url: first });
  await execute(env, alice, "videos_add", { url: second });
});
it("applies a sticky batch assignment atomically and can release it back to rules", async () => {
  await execute(env, alice, "categories_save", { id: "target", name: "Synthetic" });
  expect(
    await execute(env, alice, "videos_batch", { items, action: "assign", categoryId: "target" }),
  ).toEqual({ ok: true, updated: 2 });
  let state = await appState(env.DB, alice, {});
  expect(
    state.videos.every(
      (video) => video.manualOverride && video.categoryId === "target" && video.status === "queued",
    ),
  ).toBe(true);
  await execute(env, alice, "videos_batch", {
    items: state.videos.map(({ id, version }) => ({ id, version })),
    action: "reset",
  });
  state = await appState(env.DB, alice, {});
  expect(
    state.videos.every(
      (video) => !video.manualOverride && video.categoryId === null && video.status === "pending",
    ),
  ).toBe(true);
});
it("rejects a mixed stale or foreign selection without changing any current video", async () => {
  await execute(env, alice, "videos_update", { ...items[1], action: "exclude" });
  await expect(execute(env, alice, "videos_batch", { items, action: "exclude" })).rejects.toThrow(
    "stale",
  );
  expect(
    (await appState(env.DB, alice, {})).videos.find((video) => video.id === first)?.version,
  ).toBe(0);
  await execute(env, bob, "videos_add", { url: "abcdefghij3" });
  await expect(
    execute(env, alice, "videos_batch", {
      items: [items[0], { id: "abcdefghij3", version: 0 }],
      action: "exclude",
    }),
  ).rejects.toThrow("stale");
  expect(
    (await appState(env.DB, alice, {})).videos.find((video) => video.id === first)?.version,
  ).toBe(0);
  expect((await appState(env.DB, bob, {})).videos[0]?.manualOverride).toBe(false);
});
it("rejects empty, oversized, duplicate and uncertain-recovery batches", async () => {
  for (const selection of [[], Array.from({ length: 51 }, () => items[0]), [items[0], items[0]]]) {
    // oxlint-disable-next-line no-await-in-loop -- Each invalid request must leave the same fixture unchanged.
    await expect(
      execute(env, alice, "videos_batch", { items: selection, action: "exclude" }),
    ).rejects.toThrow("invalid_selection");
  }
  await expect(
    execute(env, alice, "videos_batch", { items, action: "retry_missing" }),
  ).rejects.toThrow("invalid_input");
  expect((await appState(env.DB, alice, {})).videos.every((video) => video.version === 0)).toBe(
    true,
  );
});
it("accepts exactly 50 videos and preserves manual exclusions during retry", async () => {
  const selection = Array.from({ length: 50 }, (_, index) => ({
    id: `test${String(index).padStart(7, "0")}`,
    version: 0,
  }));
  await env.DB.batch(
    selection.map((item) =>
      env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,discovered_at,updated_at) VALUES('alice',?,'',0,0)",
      ).bind(item.id),
    ),
  );
  expect(
    await execute(env, alice, "videos_batch", { items: selection, action: "exclude" }),
  ).toEqual({ ok: true, updated: 50 });
  await execute(env, alice, "videos_batch", {
    items: selection.map((item) => ({ ...item, version: 1 })),
    action: "retry",
  });
  const rows = await env.DB.prepare(
    "SELECT manual_override,reason,version FROM videos WHERE user_id='alice' AND id LIKE 'test%'",
  ).all<{ manual_override: number; reason: string; version: number }>();
  expect(rows.results).toHaveLength(50);
  expect(
    rows.results.every(
      (row) => row.manual_override === 1 && row.reason === "manual:exclude" && row.version === 2,
    ),
  ).toBe(true);
});
it("preserves discovery checkpoints, failures and displayed decisions on reclassification", async () => {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO channels(user_id,id,callback_token,hub_secret,reconcile_cursor,last_reconciled_at,last_error) VALUES('alice','synthetic','synthetic','synthetic','checkpoint',?,'youtube_http_404')",
  )
    .bind(now)
    .run();
  await env.DB.prepare(
    "UPDATE videos SET status='added',metadata_fetched_at=?,published_at=? WHERE user_id='alice'",
  )
    .bind(now, new Date(now).toISOString())
    .run();
  await execute(env, alice, "reevaluate");
  expect(
    (await appState(env.DB, alice, {})).videos.every(
      (video) => video.status === "added" && video.needsClassification,
    ),
  ).toBe(true);
  expect(
    await env.DB.prepare(
      "SELECT reconcile_cursor,last_reconciled_at,last_error FROM channels WHERE user_id='alice'",
    ).first(),
  ).toEqual({
    reconcile_cursor: "checkpoint",
    last_reconciled_at: now,
    last_error: "youtube_http_404",
  });
  await execute(env, alice, "settings", { backfillDays: 30 });
  expect(
    await env.DB.prepare(
      "SELECT reconcile_cursor,last_reconciled_at FROM channels WHERE user_id='alice'",
    ).first(),
  ).toEqual({ reconcile_cursor: null, last_reconciled_at: 0 });
});
it("retries only one owned failed active channel without changing budgets", async () => {
  const channel = `UC${"a".repeat(22)}`;
  await env.DB.batch(
    ["alice", "bob"].map((uid) =>
      env.DB.prepare(
        "INSERT INTO channels(user_id,id,callback_token,hub_secret,reconcile_cursor,last_error) VALUES(?,?,'synthetic','synthetic','failed','youtube_http_404')",
      ).bind(uid, channel),
    ),
  );
  await execute(env, alice, "channels_retry", { id: channel });
  expect(
    await env.DB.prepare(
      "SELECT reconcile_cursor,last_error FROM channels WHERE user_id='alice'",
    ).first(),
  ).toEqual({ reconcile_cursor: null, last_error: null });
  expect(
    await env.DB.prepare("SELECT reconcile_cursor FROM channels WHERE user_id='bob'").first(),
  ).toEqual({ reconcile_cursor: "failed" });
  await expect(execute(env, alice, "channels_retry", { id: channel })).rejects.toThrow(
    "channel_not_failed",
  );
  expect((await appState(env.DB, alice, {})).settings.dailyInsertLimit).toBe(50);
});
