import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "suguri",
    entrypoint,
    compatibilityDate: "2026-11-11",
    workersDev: false,
    previewUrls: false,
    env: {
      DB: bindings.d1({ name: "suguri-catalog" }),
      APP_ORIGIN: bindings.secret(),
      ACCESS_ISSUER: bindings.secret(),
      ACCESS_AUDIENCE: bindings.secret(),
      MCP_USERS: bindings.secret(),
      GOOGLE_CLIENT_ID: bindings.secret(),
      GOOGLE_CLIENT_SECRET: bindings.secret(),
      ENCRYPTION_KEY: bindings.secret(),
    },
    triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
    observability: {
      // OAuth codes and WebSub capabilities appear in request URLs.
      // Use the redacted application audit ledger until edge logging is reviewed.
      enabled: false,
    },
  },
});
