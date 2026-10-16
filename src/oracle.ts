import { TEST_IDS, type Run, type SuiteResult } from "./types";

export function hasCompleteTestSet(suite: SuiteResult): boolean {
  const ids = suite.tests.map((test) => test.id);
  return (
    suite.executionStatus === "completed" &&
    suite.processExitCode === (suite.tests.some((test) => test.status === "failed") ? 1 : 0) &&
    suite.infrastructureErrors.length === 0 &&
    suite.skippedCount === 0 &&
    ids.length === TEST_IDS.length &&
    new Set(ids).size === TEST_IDS.length &&
    TEST_IDS.every((id) => ids.includes(id)) &&
    suite.expectedTestIds.length === TEST_IDS.length &&
    TEST_IDS.every((id) => suite.expectedTestIds.includes(id)) &&
    suite.tests.every((test) => test.status === "passed" || test.status === "failed")
  );
}

export function classifyBaseline(suite: SuiteResult): Run["baselineStatus"] {
  if (!hasCompleteTestSet(suite)) return "inconclusive";
  const controls = suite.tests.filter((test) => ["AT-01", "AT-05", "AT-06"].includes(test.id));
  if (!controls.every((test) => test.status === "passed")) return "inconclusive";
  const duplicates = suite.tests.filter((test) => ["AT-02", "AT-03"].includes(test.id));
  if (
    duplicates.some(
      (test) =>
        test.status === "failed" &&
        (test.orderObservation?.records.length ?? 0) > 1 &&
        (test.paymentObservation?.records.length ?? 0) > 1,
    )
  ) {
    return "reproduced";
  }
  return duplicates.every((test) => test.status === "passed") ? "not_reproduced" : "inconclusive";
}

export function canVerify(run: Run, suite: SuiteResult, protectedUnchanged: boolean, evidenceReadable: boolean): boolean {
  const attempt = run.attempts.at(-1);
  return Boolean(
    run.baselineStatus === "reproduced" &&
      run.approvedContractVersion === 1 &&
      run.humanApproval === "approved" &&
      run.contractHash &&
      run.protectedHash &&
      attempt?.approval === "approved" &&
      attempt.patchStatus === "applied_in_sandbox" &&
      attempt.compile?.exitCode === 0 &&
      protectedUnchanged &&
      evidenceReadable &&
      hasCompleteTestSet(suite) &&
      suite.tests.every((test) => test.status === "passed"),
  );
}
