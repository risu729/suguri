import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      config: "./cloudflare.config.ts",
      remoteBindings: false,
      miniflare: {
        bindings: {
          APP_ORIGIN: "https://suguri.example.invalid",
          ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
          ACCESS_AUDIENCE: "synthetic-app",
          MCP_USERS: "{}",
          GOOGLE_CLIENT_ID: "synthetic-client",
          GOOGLE_CLIENT_SECRET: "synthetic-secret",
          ENCRYPTION_KEY: btoa("x".repeat(32)),
          TEST_MIGRATIONS: await readD1Migrations("migrations"),
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], maxWorkers: 2 },
});
