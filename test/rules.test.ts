import { describe, expect, it } from "vitest";
import type { Rule, VideoMetadata } from "../src/model.ts";
import { classify, validateRule } from "../src/rules.ts";

function video(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    id: "aaaaaaaaaaa",
    channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channelTitle: "Synthetic channel",
    title: "Synthetic video",
    description: "A synthetic description",
    publishedAt: "2026-11-11T00:00:00Z",
    durationSeconds: 600,
    liveState: "none",
    endedAt: null,
    thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
    ...overrides,
  };
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "rule-a",
    name: "Synthetic rule",
    priority: 100,
    enabled: true,
    action: "exclude",
    categoryId: null,
    channelId: null,
    titleIncludes: [],
    titleExcludes: [],
    descriptionIncludes: [],
    minDurationSeconds: null,
    maxDurationSeconds: null,
    kind: "any",
    ...overrides,
  };
}

describe("deterministic video rules", () => {
  it("normalizes width, case and combining characters without using regular expressions", () => {
    const sample = video({ title: "ＣＡＦＥ\u0301 [Official]" });
    expect(
      classify(sample, [rule({ titleIncludes: ["unmatched", "café [official]"] })]).status,
    ).toBe("excluded");
    expect(classify(video({ title: "anything" }), [rule({ titleIncludes: [".*"] })]).status).toBe(
      "review",
    );
  });

  it("requires every specified condition group and treats alternatives within a group as OR", () => {
    const selected = rule({
      channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
      titleIncludes: ["other", "synthetic"],
      descriptionIncludes: ["missing", "description"],
      minDurationSeconds: 600,
      maxDurationSeconds: 600,
      kind: "upload",
    });
    expect(classify(video(), [selected]).status).toBe("excluded");
    for (const change of [
      { channelId: "UCbbbbbbbbbbbbbbbbbbbbbb" },
      { title: "Different title" },
      { description: "Different text" },
      { durationSeconds: 599 },
      { durationSeconds: 601 },
      { endedAt: "2026-11-11T01:00:00Z" },
    ]) {
      expect(classify(video(change), [selected]).status).toBe("review");
    }
  });

  it("vetoes a title containing any excluded keyword after normalization", () => {
    expect(
      classify(video({ title: "Synthetic ＣＬＩＰ" }), [
        rule({ titleIncludes: ["synthetic"], titleExcludes: ["clip"] }),
      ]).status,
    ).toBe("review");
  });

  it("sorts enabled rules by priority and then id without changing the caller's array", () => {
    const rules = [
      rule({ id: "b" }),
      rule({ id: "a", action: "review" }),
      rule({ id: "disabled", priority: -1, enabled: false }),
    ];
    expect(classify(video(), rules)).toEqual({
      status: "review",
      categoryId: null,
      reason: "rule:a",
    });
    expect(rules.map((item) => item.id)).toEqual(["b", "a", "disabled"]);
    expect(classify(video(), [...rules, rule({ id: "first", priority: 0 })]).reason).toBe(
      "rule:first",
    );
  });

  it("defers live and upcoming videos until an end is recorded regardless of matching rules", () => {
    for (const liveState of ["live", "upcoming"] as const) {
      expect(classify(video({ liveState }), [rule()])).toEqual({
        status: "deferred",
        categoryId: null,
        reason: "awaiting_end",
      });
      expect(
        classify(video({ liveState, endedAt: "2026-11-11T01:00:00Z" }), [rule({ kind: "archive" })])
          .status,
      ).toBe("excluded");
    }
  });

  it("does not exclude short videos or assume a short duration identifies Shorts", () => {
    expect(classify(video({ durationSeconds: 20 }), [])).toEqual({
      status: "review",
      categoryId: null,
      reason: "unmatched",
    });
    expect(
      classify(video({ durationSeconds: 20 }), [rule({ action: "review", kind: "upload" })]).reason,
    ).toBe("rule:rule-a");
  });
});

describe("rule input validation", () => {
  it("accepts a dynamic category without seeding a preference or limiting video duration", () => {
    const selected = validateRule(
      rule({ action: "categorize", categoryId: "custom-destination-42" }),
    );
    expect(classify(video({ durationSeconds: 20 }), [selected])).toEqual({
      status: "queued",
      categoryId: "custom-destination-42",
      reason: "rule:rule-a",
    });
  });
  it("accepts an id omitted by a create request and preserves literal keywords", () => {
    const { id: _id, ...input } = rule({ titleIncludes: ["[literal]", "[literal]", "ＣＡＦＥ"] });
    expect(validateRule(input)).toEqual({
      ...input,
      id: "",
      titleIncludes: ["[literal]", "ＣＡＦＥ"],
    });
  });

  it.each([
    null,
    [],
    rule({ priority: Number.NaN }),
    rule({ priority: 0.5 }),
    rule({ titleIncludes: [""] }),
    rule({ titleIncludes: Array.from({ length: 101 }, () => "word") }),
    rule({ titleExcludes: ["x".repeat(201)] }),
    rule({ minDurationSeconds: -1 }),
    rule({ minDurationSeconds: 4, maxDurationSeconds: 3 }),
    { ...rule(), action: "unknown" },
    { ...rule(), enabled: "true" },
    { ...rule(), kind: "short" },
    { ...rule(), channelId: "not-a-channel-id" },
    { ...rule(), descriptionIncludes: "word" },
    { ...rule(), id: "x".repeat(65) },
    rule({ action: "categorize", categoryId: null }),
    rule({ action: "categorize", categoryId: "invalid/id" }),
    rule({ action: "review", categoryId: "custom-destination-42" }),
  ])("rejects invalid or unbounded rule input %#", (input) => {
    expect(() => validateRule(input)).toThrow();
  });
});
