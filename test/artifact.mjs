import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const output = ".cloudflare/output/v0/workers/default";
const config = JSON.parse(await readFile(`${output}/worker.config.json`, "utf8"));
config.manifest = {
  mainModule: "index.js",
  modules: {
    "index.js": { type: "esm", contents: await readFile(`${output}/bundle/index.js`, "utf8") },
  },
};
const runtime = new Miniflare({ workers: [{ config }] });
try {
  const response = await runtime.dispatchFetch("https://example.invalid/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: "suguri", status: "scaffold" });
  const callback = await runtime.dispatchFetch("https://example.invalid/websub", {
    method: "POST",
    body: "synthetic notification",
  });
  assert.equal(callback.status, 404);
  console.log("Built Worker health route and unimplemented callback checks passed.");
} finally {
  await runtime.dispose();
}
