import { expect, test } from "bun:test";
import { canVerify, classifyBaseline, hasCompleteTestSet } from "../../src/oracle";
import { TEST_IDS, type Run, type SuiteResult } from "../../src/types";

function suite(): SuiteResult {
  return {
    executionStatus: "completed",
    tests: TEST_IDS.map((id) => ({ id, title: id, status: "passed", durationMs: 1, attachments: [] })),
    expectedTestIds: [...TEST_IDS],
    skippedCount: 0,
    infrastructureErrors: [],
    elapsedMs: 1,
    reportPath: "report/index.html",
    resultPath: "results.json",
    screenshotPaths: ["screen.png"],
    artifactPaths: ["screen.png"],
  };
}

test("missing, duplicate, skipped, focused subsets and infrastructure errors never form a complete suite", () => {
  expect(hasCompleteTestSet(suite())).toBe(true);
  const missing = suite(); missing.tests.pop();
  const duplicate = suite(); duplicate.tests[4] = duplicate.tests[0];
  const skipped = suite(); skipped.tests[0].status = "skipped";
  const focused = suite(); focused.expectedTestIds = ["AT-01"];
  const crashed = suite(); crashed.executionStatus = "infrastructure_error";
  for (const invalid of [missing, duplicate, skipped, focused, crashed]) expect(hasCompleteTestSet(invalid)).toBe(false);
});

test("baseline reproduction requires failed duplicate assertions and recorded order/payment side effects", () => {
  const result = suite();
  expect(classifyBaseline(result)).toBe("not_reproduced");
  result.tests[1].status = "failed";
  expect(classifyBaseline(result)).toBe("inconclusive");
  result.tests[1].orderObservation = { source: "runner direct file observer", records: [{}, {}] };
  result.tests[1].paymentObservation = { source: "provider-owned ledger", records: [{}, {}] };
  expect(classifyBaseline(result)).toBe("reproduced");
  result.tests[0].status = "failed";
  expect(classifyBaseline(result)).toBe("inconclusive");
});

test("passing browser tests alone cannot establish a verified repair", () => {
  const run = {
    baselineStatus: "reproduced",
    approvedContractVersion: 1,
    humanApproval: "approved",
    contractHash: "contract",
    protectedHash: "suite",
    attempts: [{ approval: "approved", patchStatus: "applied_in_sandbox", compile: { exitCode: 0 } }],
  } as Run;
  expect(canVerify(run, suite(), true, true)).toBe(true);
  expect(canVerify(run, suite(), false, true)).toBe(false);
  expect(canVerify(run, suite(), true, false)).toBe(false);
  expect(canVerify({ ...run, baselineStatus: "not_reproduced" }, suite(), true, true)).toBe(false);
  expect(canVerify({ ...run, humanApproval: "pending" }, suite(), true, true)).toBe(false);
});
