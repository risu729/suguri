import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { ensureUser } from "../src/store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
export async function resetDatabase(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of [
    "playlist_entries",
    "operations",
    "series_videos",
    "series",
    "audit",
    "videos",
    "channels",
    "rules",
    "categories",
    "oauth_states",
    "connection",
    "settings",
    "user_quota",
    "quota_reservations",
    "quota",
    "leases",
    "users",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Delete child rows before their parent foreign keys.
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
}
export async function seedUser(id = "test-user"): Promise<string> {
  await ensureUser(env.DB, id);
  return id;
}
