import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  outputDir: ".kioskproof/ui-qa/results",
  retries: 0,
  workers: 1,
  timeout: 20000,
  reporter: [["list"], ["html", { outputFolder: ".kioskproof/ui-qa/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3098",
    trace: "on",
    screenshot: "on",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "bun src/server.ts",
    url: "http://127.0.0.1:3098/healthz",
    reuseExistingServer: false,
    env: { PORT: "3098", GEMINI_API_KEY: "", GCS_BUCKET: "", KIOSKPROOF_DATA_DIR: ".kioskproof/ui-qa/runtime" },
    timeout: 30000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 } },
  ],
});
