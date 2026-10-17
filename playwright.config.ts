import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./tests/browser",
  use: { javaScriptEnabled: false, trace: "on-first-retry" },
});
