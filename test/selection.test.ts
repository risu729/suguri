import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { Principal, Rule, VideoMetadata } from "../src/model.ts";
import { classify, classifySelection, validateRule } from "../src/rules.ts";
import { ruleTemplates } from "../src/rule-templates.ts";
import { execute } from "../src/service.ts";
import { resetDatabase, seedUser } from "./helpers.ts";

const principal: Principal = { userId: "alice", actor: "test", transport: "mcp" };
const channelId = "UCaaaaaaaaaaaaaaaaaaaaaa";
const draft = (templateId: string): Rule => {
  const template = ruleTemplates.find((entry) => entry.id === templateId);
  if (!template) throw new Error("Missing synthetic template");
  return validateRule({
    ...template.rule,
    id: `test-${templateId}`,
    channelId: template.requiresChannel ? channelId : null,
    categoryId: template.rule.action === "categorize" ? "destination" : null,
  });
};
const video = (title: string, extra: Partial<VideoMetadata> = {}): VideoMetadata => ({
  id: "abcdefghijk",
  channelId,
  channelTitle: "Synthetic performer",
  title,
  description: "Synthetic metadata",
  publishedAt: new Date().toISOString(),
  durationSeconds: 30,
  liveState: "none",
  endedAt: null,
  thumbnailUrl: "",
  ...extra,
});

describe("editable selection templates", () => {
  it("keeps all templates valid without installing personal channel or category choices", () => {
    expect(new Set(ruleTemplates.map((entry) => entry.id)).size).toBe(ruleTemplates.length);
    for (const entry of ruleTemplates) expect(draft(entry.id).name).toBe(entry.name);
    expect(
      ruleTemplates.every((entry) => !("channelId" in entry.rule) && !("categoryId" in entry.rule)),
    ).toBe(true);
  });
  it("recognizes public performances across formats and waits for an ongoing broadcast", () => {
    const rule = draft("performance");
    for (const title of [
      "ワンマンライブ 冒頭無料配信",
      "3D LIVE",
      "3DLIVE",
      "ONE-MAN LIVE",
      "ＳＯＬＯ　ＬＩＶＥ",
      "Concert live at a venue",
      "ライブ映像",
      "ライブ全編公開",
    ])
      expect(classify(video(title), [rule]).status).toBe("queued");
    expect(classify(video("Concert", { endedAt: new Date().toISOString() }), [rule]).status).toBe(
      "queued",
    );
    expect(classify(video("Concert", { liveState: "live" }), [rule]).status).toBe("deferred");
    for (const title of [
      "Concert teaser",
      "Concert 同時視聴",
      "3D LIVE 歌枠",
      "ライブ 雑談",
      "周年ライブ ダイジェスト",
      "Concert reaction",
      "ワンマンライブおつかれさま",
      "Concert チケット受付",
    ])
      expect(classify(video(title), [rule]).status).toBe("review");
  });
  it("keeps explicit songs eligible after a premiere, without using duration to discard Shorts", () => {
    const rule = draft("music");
    expect(
      classify(
        video("Synthetic (Cover)", { endedAt: new Date().toISOString(), durationSeconds: 20 }),
        [rule],
      ).status,
    ).toBe("queued");
    expect(classify(video("Synthetic Music Video", { liveState: "upcoming" }), [rule]).status).toBe(
      "deferred",
    );
    expect(
      classify(video("Synthetic 歌枠 (cover)", { endedAt: new Date().toISOString() }), [rule])
        .status,
    ).toBe("review");
    for (const title of ["KARAOKE (cover)", "Singing Stream (cover)"])
      expect(classify(video(title, { endedAt: new Date().toISOString() }), [rule]).status).toBe(
        "review",
      );
  });
  it("keeps selected-channel singing and talk separate from other channels, uploads, and concerts", () => {
    const singing = draft("singing"),
      talk = draft("talk");
    const archived = { endedAt: new Date().toISOString() };
    expect(classify(video("歌枠", archived), [singing]).status).toBe("queued");
    expect(classify(video("雑談", archived), [talk]).status).toBe("queued");
    expect(
      classify(video("歌枠", { ...archived, channelId: "UCbbbbbbbbbbbbbbbbbbbbbb" }), [singing])
        .status,
    ).toBe("review");
    expect(classify(video("歌枠"), [singing]).status).toBe("review");
    expect(classify(video("Concert", archived), [singing, talk]).status).toBe("review");
    expect(classify(video("歌枠 雑談", archived), [talk]).status).toBe("review");
  });
  it("uses the same series precedence in preview and processing and defers unfinished broadcasts", () => {
    const rule = draft("music");
    expect(
      classifySelection(video("【MV】"), [rule], { hold: true, categoryId: "destination" }).reason,
    ).toBe("series_hold");
    expect(
      classifySelection(video("Other"), [rule], { hold: false, categoryId: "destination" }).reason,
    ).toBe("series_follow");
    expect(
      classifySelection(video("Concert", { liveState: "upcoming" }), [rule], {
        hold: false,
        categoryId: "destination",
      }).reason,
    ).toBe("awaiting_end");
  });
});

beforeEach(async () => {
  await resetDatabase();
  await seedUser("alice");
  await seedUser("bob");
});

describe("selection application operations", () => {
  it("returns a reusable preview identity for equal-priority API/MCP drafts", async () => {
    await execute(env, principal, "categories_save", {
      id: "destination",
      name: "Synthetic category",
    });
    const existing = {
      ...draft("channel-review"),
      id: "50000000-0000-4000-8000-000000000000",
      priority: 200,
    };
    await execute(env, principal, "rules_save", existing);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO videos(user_id,id,channel_id,title,published_at,discovered_at,updated_at) VALUES('alice','abcdefghijk',?,'Synthetic',?,?,?)",
    )
      .bind(channelId, new Date(now).toISOString(), now, now)
      .run();
    const { id: _id, ...candidate } = draft("channel-upload");
    type Preview = { ruleId: string; matches: { effectiveDecision: { reason: string } }[] };
    const first = (await execute(env, principal, "rules_preview", candidate)) as Preview;
    const stable = { ...candidate, id: first.ruleId };
    const repeated = (await execute(env, principal, "rules_preview", stable)) as Preview;
    expect(repeated.matches[0]?.effectiveDecision).toEqual(first.matches[0]?.effectiveDecision);
    await execute(env, principal, "rules_save", stable);
    const saved = await env.DB.prepare("SELECT definition FROM rules WHERE user_id='alice'").all<{
      definition: string;
    }>();
    expect(
      classify(
        video("Synthetic"),
        saved.results.map((row) => JSON.parse(row.definition) as Rule),
      ).reason,
    ).toBe(first.matches[0]?.effectiveDecision.reason);
    expect(first.ruleId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("searches and paginates only the caller's active subscription titles without returning capabilities", async () => {
    await env.DB.batch(
      Array.from({ length: 53 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO channels(user_id,id,title,active,callback_token,hub_secret) VALUES(?,?,?,?,?,?)",
        ).bind(
          index === 52 ? "bob" : "alice",
          `channel-${index}`,
          `Synthetic ${String(index).padStart(2, "0")}`,
          index === 51 ? 0 : 1,
          "synthetic-private-callback",
          "synthetic-private-secret",
        ),
      ),
    );
    const first = (await execute(env, principal, "channels_list", {})) as {
      channels: { id: string; title: string }[];
      nextCursor: number;
    };
    expect(first.channels).toHaveLength(50);
    expect(first.nextCursor).toBe(50);
    const last = await execute(env, principal, "channels_list", { cursor: first.nextCursor });
    expect(last).toEqual({
      channels: [{ id: "channel-50", title: "Synthetic 50" }],
      nextCursor: null,
    });
    expect(await execute(env, principal, "channels_list", { q: "synthetic 50" })).toEqual(last);
    expect(await execute(env, principal, "channels_list", { q: "%" })).toEqual({
      channels: [],
      nextCursor: null,
    });
    expect(JSON.stringify(first)).not.toContain("synthetic-private");
    await Promise.all(
      [-1, 0.5, "bad"].map((cursor) =>
        expect(execute(env, principal, "channels_list", { cursor })).rejects.toThrow(
          "invalid_cursor",
        ),
      ),
    );
    await execute(env, principal, "rules_templates");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM rules").first("n")).toBe(0);
  });
  it("previews every page, existing rule priority, manual choices and series without changing data", async () => {
    await execute(env, principal, "categories_save", {
      id: "destination",
      name: "Synthetic category",
    });
    await execute(env, principal, "rules_save", {
      ...draft("channel-review"),
      id: "existing",
      titleIncludes: ["Protected"],
    });
    const now = Date.now(),
      published = new Date(now).toISOString();
    await env.DB.batch(
      Array.from({ length: 202 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO videos(user_id,id,channel_id,title,published_at,status,manual_override,reason,discovered_at,updated_at) VALUES(?,?,?,?,?,'review',?,?,?,?)",
        ).bind(
          index === 201 ? "bob" : "alice",
          String(index).padStart(11, "0"),
          channelId,
          index === 1 ? "Protected" : "Synthetic",
          published,
          index === 2 ? 1 : 0,
          index === 2 ? "manual:exclude" : "unmatched",
          now - index,
          now,
        ),
      ),
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO series(user_id,id,name,playlist_id,mode,started_at) VALUES('alice','held','Synthetic','synthetic-list','hold',?)",
      ).bind(now),
      env.DB.prepare(
        "INSERT INTO series_videos(user_id,series_id,video_id) VALUES('alice','held','00000000003')",
      ),
    ]);
    const candidate = { ...draft("channel-upload"), id: "candidate" };
    const preview = (await execute(env, principal, "rules_preview", candidate)) as {
      matches: {
        id: string;
        decision: { status: string };
        effectiveDecision: { reason: string };
        manualOverride: boolean;
      }[];
      sampled: number;
      nextCursor: number;
    };
    expect(preview.sampled).toBe(200);
    expect(preview.matches).toHaveLength(200);
    expect(preview.matches[1]).toMatchObject({
      decision: { status: "queued" },
      effectiveDecision: { reason: "rule:existing" },
    });
    expect(preview.matches[2]).toMatchObject({
      manualOverride: true,
      effectiveDecision: { reason: "manual:exclude" },
    });
    expect(preview.matches[3]?.effectiveDecision.reason).toBe("series_hold");
    const last = (await execute(env, principal, "rules_preview", {
      ...candidate,
      cursor: preview.nextCursor,
    })) as { matches: { id: string }[]; nextCursor: null };
    expect(last.matches.map((row) => row.id)).toEqual(["00000000200"]);
    expect(last.nextCursor).toBeNull();
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM videos WHERE status<>'review'").first("n"),
    ).toBe(0);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM rules").first("n")).toBe(1);
    await expect(
      execute(env, principal, "rules_preview", { ...candidate, cursor: -1 }),
    ).rejects.toThrow("invalid_cursor");
  });
});
