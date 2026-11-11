import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "suguri",
    entrypoint,
    compatibilityDate: "2026-11-11",
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 1,
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
  },
});
