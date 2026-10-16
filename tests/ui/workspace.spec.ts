import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { renderPage } from "../../src/ui";
import { DEFAULT_POLICY, TEST_IDS, type Run, type SuiteResult } from "../../src/types";

test("workspace renders real controls without horizontal overflow or browser errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#run-form")).toBeVisible();
  await expect(page.locator("#policy")).toBeEditable();
  expect(await page.locator("#delay option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["200", "800", "1500"]);
  expect(await page.locator("#repeats option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["2", "3"]);
  await expect(page.locator("#run-form button[type=submit]")).toBeDisabled();
  await page.locator("#delay").selectOption("1500");
  await page.locator("#repeats").selectOption("3");
  expect(await page.locator("#delay").inputValue()).toBe("1500");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await mkdir(".kioskproof/ui-qa", { recursive: true });
  await page.screenshot({ path: `.kioskproof/ui-qa/${testInfo.project.name}.png`, fullPage: true });
});

test("HTTP boundary rejects untrusted actions and unknown resources", async ({ request }) => {
  const health = await request.get("/healthz");
  expect(health.status()).toBe(200);
  expect((await health.json()).modelId).toBe("gemini-4-argon");
  const crossOrigin = await request.post("/api/runs", { headers: { Origin: "https://untrusted.example" }, data: {} });
  expect(crossOrigin.status()).toBe(403);
  const badType = await request.post("/api/runs", { data: "echo no" });
  expect(badType.status()).toBe(415);
  const unknown = await request.get("/api/runs/00000000-0000-0000-0000-000000000000");
  expect(unknown.status()).toBe(404);
});

test("a populated repair diff remains inside the mobile viewport", async ({ page }, testInfo) => {
  const suite: SuiteResult = {
    executionStatus: "completed", processExitCode: 0, expectedTestIds: [...TEST_IDS], skippedCount: 0,
    infrastructureErrors: [], elapsedMs: 100, reportPath: "", resultPath: "",
    screenshotPaths: [], artifactPaths: [],
    tests: TEST_IDS.map((id) => ({ id, title: id, status: "passed", durationMs: 1, attachments: [] })),
  };
  const run: Run = {
    id: "00000000-0000-4000-8000-000000000001", targetId: "synthetic-checkout", scenarioId: "duplicate-checkout",
    createdAt: "2026-10-16T03:00:00.000Z", updatedAt: "2026-10-16T03:00:01.000Z",
    phase: "complete", input: { policyText: DEFAULT_POLICY, scenarioParameters: { delayMs: 800, repeatCount: 2 } },
    baselineRevision: "sha256:" + "b".repeat(64), contractHash: "c".repeat(64), protectedHash: "d".repeat(64),
    approvedContractVersion: 1, executionStatus: "completed", baselineStatus: "reproduced",
    verificationStatus: "passed", humanApproval: "approved", verdict: "VERIFIED_IN_SCOPE",
    executionMode: "reviewed_fixed_target", baseline: suite, evidence: [], approvals: [], events: [],
    durations: {}, storage: { mode: "local" }, limitations: [],
    attempts: [{
      number: 1, patchStatus: "applied_in_sandbox", approval: "approved", elapsedMs: 100,
      patchHash: "e".repeat(64), protectedHashesMatch: true, suite,
      proposal: {
        baselineRevision: "sha256:" + "b".repeat(64), changedPaths: ["target/checkout.ts"],
        rationale: "UI layout fixture.", evidenceIds: [], observations: [], hypotheses: [], attemptNumber: 1,
        diff: "--- a/target/checkout.ts\n+++ b/target/checkout.ts\n@@ -1,1 +1,2 @@\n+const checkoutByIntent = new Map<string, Promise<CheckoutResult>>();\n export async function checkout() {}\n",
      },
    }],
  };
  await page.route("**/layout-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: renderPage(run, [run], { modelId: "gemini-4-argon", cloudProject: "layout-fixture", cloudRegion: "test", storageMode: "local", agentAvailable: false }),
  }));
  await page.goto("/layout-fixture");
  await expect(page.locator(".diff")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const diff = page.locator(".diff");
  expect(await diff.evaluate((element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `.kioskproof/ui-qa/populated-${testInfo.project.name}.png`, fullPage: true });
});
