import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  workers: 3,
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER === "true" ? undefined : {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 1024, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
