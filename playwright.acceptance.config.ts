import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const outputRoot = resolve(process.env.KIOSKPROOF_OUTPUT_DIR ?? "artifacts/acceptance");
const chromeExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/acceptance",
  outputDir: resolve(outputRoot, "test-results"),
  timeout: 20_000,
  globalTimeout: 90_000,
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["json", { outputFile: resolve(outputRoot, "playwright-results.json") }],
    ["html", { outputFolder: resolve(outputRoot, "playwright-html"), open: "never" }],
  ],
  use: {
    trace: "on",
    video: "on",
    screenshot: "on",
    viewport: { width: 960, height: 720 },
    launchOptions: chromeExecutable ? { executablePath: chromeExecutable } : undefined,
  },
});
