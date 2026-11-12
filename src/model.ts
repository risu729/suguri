export type CategoryId = string;
export type VideoStatus =
  | "pending"
  | "review"
  | "queued"
  | "added"
  | "excluded"
  | "deferred"
  | "error"
  | "unavailable"
  | "removed";

export interface VideoMetadata {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  liveState: "none" | "live" | "upcoming";
  endedAt: string | null;
  thumbnailUrl: string;
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  action: "categorize" | "exclude" | "review";
  categoryId: CategoryId | null;
  channelId: string | null;
  titleIncludes: string[];
  titleExcludes: string[];
  descriptionIncludes: string[];
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  kind: "any" | "upload" | "archive";
}

export interface Decision {
  status: "queued" | "review" | "excluded" | "deferred";
  categoryId: CategoryId | null;
  reason: string;
}

export interface VideoRow {
  user_id: string;
  id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string;
  published_at: string;
  duration_seconds: number | null;
  live_state: "none" | "live" | "upcoming";
  ended_at: string | null;
  thumbnail_url: string;
  metadata_fetched_at: number;
  metadata_dirty: number;
  needs_classification: number;
  status: VideoStatus;
  category_id: CategoryId | null;
  manual_override: number;
  reason: string;
  last_error: string | null;
  attempts: number;
  next_attempt_at: number;
  discovered_at: number;
  updated_at: number;
  version: number;
}

export interface Category {
  id: CategoryId;
  name: string;
  playlistId: string | null;
  playlistState: "unconfigured" | "ready" | "uncertain";
  lastError: string | null;
}

export interface Settings {
  enabled: boolean;
  dailyBudgetUnits: number;
  dailyInsertLimit: number;
  discoveryStart: number;
  backfillDays: number;
}

export interface VideoView extends VideoMetadata {
  needsClassification: boolean;
  status: VideoStatus;
  categoryId: CategoryId | null;
  manualOverride: boolean;
  reason: string;
  lastError: string | null;
  version: number;
}

export interface AppState {
  authenticated: boolean;
  series: Series[];
  connected: boolean;
  reconnectRequired: boolean;
  csrfToken: string;
  channelTitle: string | null;
  settings: Settings;
  categories: Category[];
  rules: Rule[];
  videos: VideoView[];
  hasMore: boolean;
  nextCursor: number | null;
  counts: Record<string, number>;
  quota: { day: string; units: number; insertions: number };
  channels: {
    total: number;
    activeWebSub: number;
    backfillComplete: number;
    errors: number;
    backfillFailed: number;
  };
  collectionErrors: { channelId: string; title: string; code: string; nextAttemptAt: number }[];
  notifications: {
    videos: number;
    lastReceivedAt: number | null;
    recent: {
      videoId: string;
      firstReceivedAt: number;
      lastReceivedAt: number;
      discoveredFromNotificationAt: number | null;
      publishedAt: string;
      status: VideoStatus;
      manualOverride: number;
      addedAt: number | null;
    }[];
  };
  lastSyncAt: number | null;
  lastRunAt: number | null;
  lastError: string | null;
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export function metadataFromRow(row: VideoRow): VideoMetadata {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    title: row.title,
    description: row.description,
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds ?? 0,
    liveState: row.live_state,
    endedAt: row.ended_at,
    thumbnailUrl: row.thumbnail_url,
  };
}

export interface Series {
  id: string;
  name: string;
  playlistId: string;
  categoryId: string | null;
  mode: "hold" | "follow";
  startedAt: number;
}
export interface Principal {
  userId: string;
  actor: string;
  transport: "browser" | "mcp";
}
