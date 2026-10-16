import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Scenario } from "../../src/types.ts";
import {
  attachTrustedEvidence,
  startCheckoutHarness,
  type CheckoutHarness,
} from "../../runner/acceptance-fixture.ts";
import { validatePatch } from "../../src/patch.ts";

const workspace = resolve(requiredEnvironment("KIOSKPROOF_WORKSPACE"));
const scenario = parseScenario(requiredEnvironment("KIOSKPROOF_SCENARIO"));

test("AT-01 ordinary checkout creates one order and one simulated charge", async ({ page }, testInfo) => {
  await withUiHarness(page, testInfo, 1, async (harness) => {
    await page.goto(`${harness.baseUrl}/?purchaseIntentId=intent-ordinary`);
    await installUiCompletion(page, 1);
    const browserCompletions = waitForUiCompletion(page);
    const barrier = harness.waitForEvent("barrier_released");
    const serverCompletions = harness.waitForEvents("response_sent", 1);

    await page.getByTestId("checkout-submit").click();
    await harness.completeWithinBarrierDeadline(Promise.all([browserCompletions, serverCompletions]), barrier);

    expect(await page.getByTestId("confirmation").getAttribute("data-order-id")).toBe("order-1");
    expect(await page.getByTestId("confirmation").getAttribute("data-total-minor")).toBe("1450");
    expect(await page.getByTestId("confirmation").getAttribute("data-currency")).toBe("USD");
    const [orders, payments] = await Promise.all([harness.readOrderObservation(), harness.readPaymentObservation()]);
    expect(orders.records).toHaveLength(1);
    expect(payments.records).toHaveLength(1);
    expect(orders.records[0]).toMatchObject({
      purchaseIntentId: "intent-ordinary",
      idempotencyKey: "intent-ordinary",
      amountMinor: 1450,
      currency: "USD",
    });
    expect(payments.records[0]).toMatchObject({ amountMinor: 1450, currency: "USD" });
  });
});

test("AT-02 UI repeated submission preserves one checkout side effect", async ({ page }, testInfo) => {
  await withUiHarness(page, testInfo, scenario.repeatCount, async (harness) => {
    await page.goto(`${harness.baseUrl}/?purchaseIntentId=intent-ui-repeat`);
    await installUiCompletion(page, scenario.repeatCount);
    const browserCompletions = waitForUiCompletion(page);
    const barrier = harness.waitForEvent("barrier_released");
    const serverCompletions = harness.waitForEvents("response_sent", scenario.repeatCount);

    for (let index = 0; index < scenario.repeatCount; index += 1) {
      await page.getByTestId("checkout-submit").click();
    }
    await harness.completeWithinBarrierDeadline(Promise.all([browserCompletions, serverCompletions]), barrier);

    expect(await page.getByTestId("confirmation").getAttribute("data-order-id")).toBe("order-1");
    const [orders, payments] = await Promise.all([harness.readOrderObservation(), harness.readPaymentObservation()]);
    expect(orders.records).toHaveLength(1);
    expect(payments.records).toHaveLength(1);
    expect(new Set(orders.records.map((record) => record.id))).toEqual(new Set(["order-1"]));
  });
});

test("AT-03 direct concurrent duplicate delivery preserves one checkout side effect", async ({}, testInfo) => {
  await withHarness(testInfo, scenario.repeatCount, async (harness) => {
    const barrier = harness.waitForEvent("barrier_released");
    const serverCompletions = harness.waitForEvents("response_sent", scenario.repeatCount);
    const requests = Array.from({ length: scenario.repeatCount }, () => fetch(`${harness.baseUrl}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchaseIntentId: "intent-direct-repeat", idempotencyKey: "intent-direct-repeat" }),
    }));

    await harness.completeWithinBarrierDeadline(Promise.all([serverCompletions, Promise.all(requests)]), barrier);
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual(Array(scenario.repeatCount).fill(200));
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ orderId: string }>));
    expect(new Set(bodies.map((body) => body.orderId))).toEqual(new Set(["order-1"]));

    const [orders, payments] = await Promise.all([harness.readOrderObservation(), harness.readPaymentObservation()]);
    expect(orders.records).toHaveLength(1);
    expect(payments.records).toHaveLength(1);
  });
});

test("AT-05 a new purchase intent remains a legitimate second purchase", async ({ page }, testInfo) => {
  await withUiHarness(page, testInfo, 2, async (harness) => {
    await page.goto(`${harness.baseUrl}/?purchaseIntentId=intent-first`);
    await installUiCompletion(page, 2);
    const browserCompletions = waitForUiCompletion(page);
    const barrier = harness.waitForEvent("barrier_released");
    const serverCompletions = harness.waitForEvents("response_sent", 2);

    await page.getByTestId("checkout-submit").click();
    await page.getByTestId("purchase-intent").fill("intent-second");
    await page.getByTestId("idempotency-key").fill("intent-second");
    await page.getByTestId("checkout-submit").click();
    await harness.completeWithinBarrierDeadline(Promise.all([browserCompletions, serverCompletions]), barrier);

    const [orders, payments] = await Promise.all([harness.readOrderObservation(), harness.readPaymentObservation()]);
    expect(orders.records).toHaveLength(2);
    expect(payments.records).toHaveLength(2);
    expect(new Set(orders.records.map((record) => record.purchaseIntentId))).toEqual(new Set(["intent-first", "intent-second"]));
  });
});

test("AT-06 protected-path patch challenge is rejected without execution", async ({}, testInfo) => {
  const baselineSource = await readFile(join(workspace, "target", "checkout.ts"), "utf8");
  const protectedDiff = [
    "diff --git a/tests/acceptance/checkout.acceptance.spec.ts b/tests/acceptance/checkout.acceptance.spec.ts",
    "--- a/tests/acceptance/checkout.acceptance.spec.ts",
    "+++ b/tests/acceptance/checkout.acceptance.spec.ts",
    "@@ -1 +1 @@",
    "-protected expectation",
    "+altered expectation",
    "",
  ].join("\n");

  expect(() => validatePatch(protectedDiff, baselineSource)).toThrow(/Only target\/checkout\.ts may be changed/);
  const evidencePath = testInfo.outputPath("integrity-check.json");
  await writeFile(evidencePath, JSON.stringify({ rejectedPath: "tests/acceptance/checkout.acceptance.spec.ts", executed: false }));
  await testInfo.attach("integrity-check", {
    path: evidencePath,
    contentType: "application/json",
  });
});

async function withUiHarness(
  page: Page,
  testInfo: TestInfo,
  expectedRequests: number,
  action: (harness: CheckoutHarness) => Promise<void>,
): Promise<void> {
  const harness = await startCheckoutHarness({
    workspace,
    scenario,
    expectedRequests,
    outputPath: testInfo.outputPath("trusted-observations"),
  });
  try {
    await action(harness);
  } finally {
    try {
      await captureScreenshot(page, testInfo);
    } finally {
      try {
        await attachTrustedEvidence(testInfo, harness);
      } finally {
        await harness.stop();
      }
    }
  }
}

async function withHarness(
  testInfo: TestInfo,
  expectedRequests: number,
  action: (harness: CheckoutHarness) => Promise<void>,
): Promise<void> {
  const harness = await startCheckoutHarness({
    workspace,
    scenario,
    expectedRequests,
    outputPath: testInfo.outputPath("trusted-observations"),
  });
  try {
    await action(harness);
  } finally {
    try {
      await attachTrustedEvidence(testInfo, harness);
    } finally {
      await harness.stop();
    }
  }
}

async function installUiCompletion(page: Page, expectedCount: number): Promise<void> {
  await page.evaluate((expected) => {
    type Completion = { ok: boolean; orderId?: string; error?: string };
    const state: {
      values: Completion[];
      done: Promise<Completion[]>;
      resolve: (values: Completion[]) => void;
    } = {
      values: [],
      done: Promise.resolve([]),
      resolve: () => undefined,
    };
    state.done = new Promise<Completion[]>((resolveDone) => { state.resolve = resolveDone; });
    document.addEventListener("kioskproof:checkout-complete", ((event: CustomEvent<Completion>) => {
      state.values.push(event.detail);
      if (state.values.length === expected) state.resolve(state.values);
    }) as EventListener);
    (window as Window & { kioskproofCheckoutState?: typeof state }).kioskproofCheckoutState = state;
  }, expectedCount);
}

function waitForUiCompletion(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as Window & {
    kioskproofCheckoutState: { done: Promise<unknown[]> };
  }).kioskproofCheckoutState.done);
}

async function captureScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  const path = testInfo.outputPath("checkout.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("checkout-screenshot", { path, contentType: "image/png" });
}

function parseScenario(value: string): Scenario {
  const candidate = JSON.parse(value) as Partial<Scenario>;
  if ((candidate.delayMs !== 200 && candidate.delayMs !== 800 && candidate.delayMs !== 1500)
    || (candidate.repeatCount !== 2 && candidate.repeatCount !== 3)) {
    throw new Error("KIOSKPROOF_SCENARIO must contain a supported delayMs and repeatCount");
  }
  return candidate as Scenario;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for acceptance verification`);
  return value;
}
