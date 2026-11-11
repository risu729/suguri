import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("local Worker entrypoint", () => {
  it.each(["/info/about", "/info/privacy"])(
    "serves static information at %s without authentication or user data",
    async (path) => {
      const response = await SELF.fetch(`https://example.invalid${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.get("set-cookie")).toBeNull();
      const body = await response.text();
      expect(body).toContain("Suguri");
      expect(body).not.toContain("<script");
      const head = await SELF.fetch(`https://example.invalid${path}`, { method: "HEAD" });
      expect(await head.text()).toBe("");
      const write = await SELF.fetch(`https://example.invalid${path}`, { method: "POST" });
      expect(write.status).toBe(405);
    },
  );

  it("does not expose other routes through the public information prefix", async () => {
    const unknown = await SELF.fetch("https://example.invalid/info/api/state");
    expect(unknown.status).toBe(404);
    const protectedApi = await SELF.fetch("https://example.invalid/api/state");
    expect(protectedApi.ok).toBe(false);
  });

  it("identifies implementation without claiming production verification", async () => {
    const response = await SELF.fetch("https://example.invalid/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      service: "suguri",
      status: "implemented",
      productionVerified: false,
    });
  });

  it("supports HEAD without a response body", async () => {
    const response = await SELF.fetch("https://example.invalid/health", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("does not acknowledge unimplemented callbacks", async () => {
    const response = await SELF.fetch("https://example.invalid/websub", {
      method: "POST",
      body: "synthetic notification",
    });
    expect(response.status).toBe(404);
  });

  it("rejects writes to the health route", async () => {
    const response = await SELF.fetch("https://example.invalid/health", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
