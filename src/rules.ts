import { isCategoryId, type Decision, type Rule, type VideoMetadata } from "./model.ts";

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function includesAny(content: string, candidates: string[]): boolean {
  return candidates.some((keyword) => content.includes(normalize(keyword)));
}

function matches(video: VideoMetadata, rule: Rule): boolean {
  const title = normalize(video.title);
  const description = normalize(video.description);
  const archive = video.endedAt !== null;
  return (
    (rule.channelId === null || video.channelId === rule.channelId) &&
    (rule.titleIncludes.length === 0 || includesAny(title, rule.titleIncludes)) &&
    !includesAny(title, rule.titleExcludes) &&
    (rule.descriptionIncludes.length === 0 || includesAny(description, rule.descriptionIncludes)) &&
    (rule.minDurationSeconds === null || video.durationSeconds >= rule.minDurationSeconds) &&
    (rule.maxDurationSeconds === null || video.durationSeconds <= rule.maxDurationSeconds) &&
    (rule.kind === "any" || (rule.kind === "archive" ? archive : !archive))
  );
}

export function classify(video: VideoMetadata, rules: Rule[]): Decision {
  if (video.liveState !== "none" && video.endedAt === null) {
    return { status: "deferred", categoryId: null, reason: "awaiting_end" };
  }
  const ordered = rules
    .filter((rule) => rule.enabled)
    .toSorted((left, right) =>
      left.priority !== right.priority
        ? left.priority - right.priority
        : left.id < right.id
          ? -1
          : left.id > right.id
            ? 1
            : 0,
    );
  for (const rule of ordered) {
    if (!matches(video, rule)) continue;
    return {
      status:
        rule.action === "categorize" ? "queued" : rule.action === "exclude" ? "excluded" : "review",
      categoryId: rule.action === "categorize" ? rule.categoryId : null,
      reason: `rule:${rule.id}`,
    };
  }
  return { status: "review", categoryId: null, reason: "unmatched" };
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function keywords(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`Invalid ${label}`);
  return [...new Set(value.map((keyword) => text(keyword, label, 200)))];
}

function duration(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function validateRule(value: unknown): Rule {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid rule");
  }
  const candidate = value as Record<string, unknown>;
  const id =
    candidate["id"] === undefined || candidate["id"] === "" ? "" : text(candidate["id"], "id", 64);
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid id");
  const name = text(candidate["name"], "name", 120);
  const priority = candidate["priority"];
  if (typeof priority !== "number" || !Number.isSafeInteger(priority))
    throw new Error("Invalid priority");
  const enabled = candidate["enabled"];
  if (typeof enabled !== "boolean") throw new Error("Invalid enabled");
  const action = candidate["action"];
  if (action !== "categorize" && action !== "exclude" && action !== "review") {
    throw new Error("Invalid action");
  }
  const categoryId = candidate["categoryId"] ?? null;
  if (action === "categorize" ? !isCategoryId(categoryId) : categoryId !== null) {
    throw new Error("Invalid categoryId");
  }
  const channelId =
    candidate["channelId"] == null ? null : text(candidate["channelId"], "channelId", 24);
  if (channelId !== null && !/^UC[A-Za-z0-9_-]{22}$/.test(channelId))
    throw new Error("Invalid channelId");
  const minDurationSeconds = duration(candidate["minDurationSeconds"], "minDurationSeconds");
  const maxDurationSeconds = duration(candidate["maxDurationSeconds"], "maxDurationSeconds");
  if (
    minDurationSeconds !== null &&
    maxDurationSeconds !== null &&
    minDurationSeconds > maxDurationSeconds
  ) {
    throw new Error("Invalid duration range");
  }
  const kind = candidate["kind"];
  if (kind !== "any" && kind !== "upload" && kind !== "archive") throw new Error("Invalid kind");
  return {
    id,
    name,
    priority,
    enabled,
    action,
    categoryId: isCategoryId(categoryId) ? categoryId : null,
    channelId,
    titleIncludes: keywords(candidate["titleIncludes"], "titleIncludes"),
    titleExcludes: keywords(candidate["titleExcludes"], "titleExcludes"),
    descriptionIncludes: keywords(candidate["descriptionIncludes"], "descriptionIncludes"),
    minDurationSeconds,
    maxDurationSeconds,
    kind,
  };
}
