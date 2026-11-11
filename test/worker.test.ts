import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("local Worker entrypoint", () => {
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
