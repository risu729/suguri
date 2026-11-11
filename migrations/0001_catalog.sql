CREATE TABLE users (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, csrf_token TEXT NOT NULL
);
CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  daily_budget_units INTEGER NOT NULL DEFAULT 7500 CHECK(daily_budget_units BETWEEN 100 AND 9500),
  daily_insert_limit INTEGER NOT NULL DEFAULT 50 CHECK(daily_insert_limit BETWEEN 1 AND 150),
  discovery_start INTEGER NOT NULL, backfill_days INTEGER NOT NULL DEFAULT 7 CHECK(backfill_days BETWEEN 1 AND 30),
  sync_cursor TEXT, sync_generation INTEGER NOT NULL DEFAULT 0,
  sync_in_progress INTEGER NOT NULL DEFAULT 0, last_sync_at INTEGER,
  last_run_at INTEGER, last_error TEXT
);
CREATE TABLE connection (
  user_id TEXT PRIMARY KEY REFERENCES users(id), channel_id TEXT NOT NULL, channel_title TEXT NOT NULL,
  refresh_token TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL,
  reconnect_required INTEGER NOT NULL DEFAULT 0, connected_at INTEGER NOT NULL
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  verifier TEXT NOT NULL, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE quota (day TEXT PRIMARY KEY, units INTEGER NOT NULL DEFAULT 0, insertions INTEGER NOT NULL DEFAULT 0);
CREATE TABLE user_quota (
  user_id TEXT NOT NULL, day TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 0, insertions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,day)
);
CREATE TABLE quota_reservations (id TEXT PRIMARY KEY);
CREATE TABLE categories (
  user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, name TEXT NOT NULL,
  playlist_id TEXT, playlist_state TEXT NOT NULL DEFAULT 'unconfigured' CHECK(playlist_state IN ('unconfigured','ready','uncertain')),
  last_error TEXT, PRIMARY KEY(user_id,id), UNIQUE(user_id,playlist_id)
);
CREATE TABLE rules (
  user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, definition TEXT NOT NULL,
  priority INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE TABLE channels (
  user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, sync_generation INTEGER NOT NULL DEFAULT 0,
  callback_token TEXT NOT NULL, hub_secret TEXT NOT NULL, lease_expires_at INTEGER NOT NULL DEFAULT 0,
  pending_mode TEXT CHECK(pending_mode IN ('subscribe','unsubscribe')), pending_until INTEGER NOT NULL DEFAULT 0,
  renew_after INTEGER NOT NULL DEFAULT 0, last_reconciled_at INTEGER NOT NULL DEFAULT 0,
  reconcile_cursor TEXT, last_error TEXT, PRIMARY KEY(user_id,id)
);
CREATE TABLE videos (
  user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '', duration_seconds INTEGER,
  live_state TEXT NOT NULL DEFAULT 'none' CHECK(live_state IN ('none','live','upcoming')),
  ended_at TEXT, thumbnail_url TEXT NOT NULL DEFAULT '', metadata_fetched_at INTEGER NOT NULL DEFAULT 0,
  metadata_dirty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','review','queued','added','excluded','deferred','error','unavailable','removed')),
  category_id TEXT, manual_override INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
  last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
  discovered_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id)
);
CREATE INDEX videos_work ON videos(user_id,status,next_attempt_at);
CREATE INDEX videos_display ON videos(user_id,discovered_at DESC,id);
CREATE TABLE playlist_entries (
  user_id TEXT NOT NULL, video_id TEXT NOT NULL, category_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL, item_id TEXT NOT NULL,
  PRIMARY KEY(user_id,video_id,category_id),
  FOREIGN KEY(user_id,video_id) REFERENCES videos(user_id,id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id)
);
CREATE TABLE operations (
  user_id TEXT NOT NULL, video_id TEXT NOT NULL, category_id TEXT NOT NULL, playlist_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('insert','delete')), state TEXT NOT NULL CHECK(state IN ('intent','uncertain','done')),
  item_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,video_id,category_id,kind)
);
CREATE TABLE series (
  user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, playlist_id TEXT NOT NULL,
  category_id TEXT, mode TEXT NOT NULL CHECK(mode IN ('hold','follow')), started_at INTEGER NOT NULL,
  cursor TEXT, last_checked_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id)
);
CREATE TABLE series_videos (user_id TEXT NOT NULL, series_id TEXT NOT NULL, video_id TEXT NOT NULL, PRIMARY KEY(user_id,series_id,video_id));
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, actor TEXT NOT NULL DEFAULT 'system',
  video_id TEXT, action TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
