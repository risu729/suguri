import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { expireMetadata, refreshMetadata } from "../src/maintenance.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

beforeEach(async () => {
  await resetDatabase();
  await seedUser("alice");
  await seedUser("bob");
});
it("expires stale API display metadata while preserving sticky manual decisions", async () => {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO videos(user_id,id,channel_id,title,description,status,manual_override,metadata_fetched_at,discovered_at,updated_at) VALUES('alice','abcdefghijk','','Old title','Old description','excluded',1,?,?,?)",
  )
    .bind(now - 30 * 86400000, now, now)
    .run();
  await expireMetadata(env.DB, now);
  expect(
    await env.DB.prepare(
      "SELECT title,description,status,manual_override,metadata_dirty FROM videos",
    ).first(),
  ).toEqual({
    title: "",
    description: "",
    status: "excluded",
    manual_override: 1,
    metadata_dirty: 1,
  });
});
it("refreshes a user's dirty metadata without overriding manual classification or another user", async () => {
  await env.DB.batch(
    ["alice", "bob"].map((uid) =>
      env.DB.prepare(
        "INSERT INTO videos(user_id,id,channel_id,title,status,manual_override,metadata_dirty,discovered_at,updated_at) VALUES(?,'abcdefghijk','','Old','excluded',1,1,?,?)",
      ).bind(uid, Date.now(), Date.now()),
    ),
  );
  await refreshMetadata(env, "alice", {
    video: async () => ({
      id: "abcdefghijk",
      channelId: `UC${"a".repeat(22)}`,
      channelTitle: "Synthetic",
      title: "Updated",
      description: "Updated description",
      publishedAt: new Date().toISOString(),
      durationSeconds: 120,
      liveState: "none",
      endedAt: null,
      thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
    }),
  });
  expect(
    await env.DB.prepare(
      "SELECT title,status,manual_override,metadata_dirty FROM videos WHERE user_id='alice'",
    ).first(),
  ).toEqual({ title: "Updated", status: "excluded", manual_override: 1, metadata_dirty: 0 });
  expect(await env.DB.prepare("SELECT title FROM videos WHERE user_id='bob'").first()).toEqual({
    title: "Old",
  });
});
