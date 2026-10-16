import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { renderPage, renderRun } from "../../src/ui";
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
  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).modelId).toBe("gemini-4-argon");
  const crossOrigin = await request.post("/api/runs", { headers: { Origin: "https://untrusted.example" }, data: {} });
  expect(crossOrigin.status()).toBe(403);
  const badType = await request.post("/api/runs", { data: "echo no" });
  expect(badType.status()).toBe(415);
  const unknown = await request.get("/api/runs/00000000-0000-0000-0000-000000000000");
  expect(unknown.status()).toBe(404);
});

test("starting a run moves the live workflow ahead of the intake form", async ({ page }, testInfo) => {
  const now = new Date().toISOString();
  const run: Run = {
    id: "00000000-0000-4000-8000-000000000002", targetId: "synthetic-checkout", scenarioId: "duplicate-checkout",
    createdAt: now, updatedAt: now, phase: "preparing",
    input: { policyText: DEFAULT_POLICY, scenarioParameters: { delayMs: 800, repeatCount: 2 } },
    baselineRevision: "sha256:" + "b".repeat(64), executionStatus: "completed",
    baselineStatus: "inconclusive", verificationStatus: "not_run", humanApproval: "pending",
    verdict: "NOT_VERIFIED", executionMode: "reviewed_fixed_target", attempts: [],
    evidence: [], approvals: [], events: [], durations: {}, storage: { mode: "local" }, limitations: [],
  };
  await page.route("**/new-run-layout", (route) => route.fulfill({
    contentType: "text/html",
    body: renderPage(undefined, [], {
      modelId: "gemini-4-argon", cloudProject: "layout-fixture", cloudRegion: "test",
      storageMode: "local", agentAvailable: true,
    }),
  }));
  await page.route("**/api/runs", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ run, html: renderRun(run) }),
  }));
  await page.goto("/new-run-layout");
  await page.locator('#run-form button[type="submit"]').click();
  await expect(page.locator("#run-panel [data-run-id]")).toBeVisible();
  await expect(page.locator(".content.has-run")).toBeVisible();
  const positions = await page.evaluate(() => ({
    run: document.querySelector("#run-panel")!.getBoundingClientRect().top,
    form: document.querySelector(".intake")!.getBoundingClientRect().top,
  }));
  expect(positions.run).toBeLessThan(positions.form);
  await expect(page.locator(".rail-history .selected")).toHaveCount(1);
  await expect(page.locator(".rail-empty")).toHaveCount(0);
  await mkdir(".kioskproof/ui-qa", { recursive: true });
  await page.screenshot({ path: `.kioskproof/ui-qa/created-${testInfo.project.name}.png`, fullPage: true });
});

test("a populated repair diff remains inside the mobile viewport", async ({ page }, testInfo) => {
  const timestamp = new Date().toISOString();
  const suite: SuiteResult = {
    executionStatus: "completed", processExitCode: 0, expectedTestIds: [...TEST_IDS], skippedCount: 0,
    infrastructureErrors: [], elapsedMs: 100, reportPath: "", resultPath: "",
    screenshotPaths: [], artifactPaths: [],
    tests: TEST_IDS.map((id) => ({ id, title: id, status: "passed", durationMs: 1, attachments: [] })),
  };
  const afterRepeated = suite.tests.find((item) => item.id === "AT-02")!;
  afterRepeated.orderObservation = { source: "fixture-order-file", records: [{}] };
  afterRepeated.paymentObservation = { source: "fixture-provider-ledger", records: [{}] };
  const baseline: SuiteResult = {
    ...suite,
    processExitCode: 1,
    tests: suite.tests.map((item) => ["AT-02", "AT-03"].includes(item.id) ? {
      ...item,
      status: "failed",
      orderObservation: { source: "fixture-order-file", records: [{}, {}] },
      paymentObservation: { source: "fixture-provider-ledger", records: [{}, {}] },
    } : item),
  };
  const run: Run = {
    id: "00000000-0000-4000-8000-000000000001", targetId: "synthetic-checkout", scenarioId: "duplicate-checkout",
    createdAt: timestamp, updatedAt: timestamp,
    phase: "complete", input: { policyText: DEFAULT_POLICY, scenarioParameters: { delayMs: 800, repeatCount: 2 } },
    baselineRevision: "sha256:" + "b".repeat(64), contractHash: "c".repeat(64), protectedHash: "d".repeat(64),
    contract: {
      ruleId: "POL-001", version: 1, interpretation: "SUPPORTED", reviewReason: "",
      scope: "Synthetic kiosk checkout", preconditions: [], actions: [], evidenceSources: [],
      expectedOutcome: "A repeated purchase intent produces one order and one simulated charge.",
    },
    approvedContractVersion: 1, executionStatus: "completed", baselineStatus: "reproduced",
    verificationStatus: "passed", humanApproval: "approved", verdict: "VERIFIED_IN_SCOPE",
    executionMode: "reviewed_fixed_target", baseline, evidence: [], approvals: [], events: [],
    durations: {}, storage: { mode: "local" }, limitations: [],
    attempts: [{
      number: 1, patchStatus: "applied_in_sandbox", approval: "approved", elapsedMs: 100,
      patchHash: "e".repeat(64), protectedHashesMatch: true, suite,
      compile: { executionStatus: "completed", exitCode: 0, signal: null, output: "", elapsedMs: 1 },
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
  await expect(page.locator(".workflow-job.job-passed")).toHaveCount(4);
  await expect(page.locator(".comparison .count-grid").first().locator("strong")).toHaveText(["2", "2"]);
  await expect(page.locator(".comparison .count-grid").last().locator("strong")).toHaveText(["1", "1"]);
  await page.locator('[data-tab="patch"]').click();
  await expect(page.locator(".diff")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const diff = page.locator(".diff");
  expect(await diff.evaluate((element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await page.locator('[data-tab="evidence"]').click();
  await expect(page.locator("#panel-evidence .hash-row")).toHaveCount(3);
  expect(await page.locator(".diff").isVisible()).toBe(false);
  run.phase = "verifying";
  run.verdict = "NOT_VERIFIED";
  run.verificationStatus = "not_run";
  run.attempts[0].suite = undefined;
  run.liveSuite = {
    phase: "after-1", startedAt: run.createdAt, updatedAt: run.updatedAt,
    tests: TEST_IDS.map((id) => ({
      id, title: `${id} checkout`, status: id === "AT-02" ? "running" : "queued", timestamp: run.updatedAt,
    })),
  };
  await page.reload();
  await expect(page.locator(".workflow-job.job-running")).toHaveCount(1);
  await expect(page.locator(".job-tests .test-running")).toHaveCount(1);
  await page.screenshot({ path: `.kioskproof/ui-qa/populated-${testInfo.project.name}.png`, fullPage: true });
  run.phase = "failed";
  run.verificationStatus = "failed";
  run.verdict = "NOT_VERIFIED";
  run.liveSuite = undefined;
  run.attempts[0].patchStatus = "compile_failed";
  run.attempts[0].compile = { executionStatus: "completed", exitCode: 2, signal: null, output: "TS2322", elapsedMs: 1 };
  run.attempts[0].suite = undefined;
  run.attempts[0].protectedHashesMatch = undefined;
  await page.reload();
  await expect(page.locator('[data-action="repair"]')).toBeVisible();
  await page.locator('[data-tab="patch"]').click();
  await expect(page.locator(".diff")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `.kioskproof/ui-qa/compile-failed-${testInfo.project.name}.png`, fullPage: true });
});
