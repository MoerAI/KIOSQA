import { expect, test } from "bun:test";
import { interpretPolicy, proposePatch } from "../../src/model";
import { DEFAULT_POLICY, type RepairContext } from "../../src/types";

test("invalid model inputs are rejected before starting a process or consuming event tokens", async () => {
  await expect(interpretPolicy("short", { delayMs: 200, repeatCount: 2 })).rejects.toThrow();
  await expect(interpretPolicy("x".repeat(4097), { delayMs: 800, repeatCount: 2 })).rejects.toThrow();
  await expect(interpretPolicy(DEFAULT_POLICY, { delayMs: 42, repeatCount: 2 } as never)).rejects.toThrow();
});

test("repair context and evidence references stay bounded", async () => {
  const context: RepairContext = {
    policyText: DEFAULT_POLICY,
    contract: {
      ruleId: "POL-001", version: 1, interpretation: "SUPPORTED", reviewReason: "",
      scope: "synthetic", preconditions: ["fresh"], actions: ["duplicate"],
      expectedOutcome: "one", evidenceSources: ["policy"],
    },
    baselineRevision: "sha256:baseline",
    source: "export const checkout = 1;\n",
    supportingSource: "types",
    evidence: "{}",
    evidenceIds: ["EV-001"],
    screenshotPaths: [],
    attemptNumber: 1,
  };
  await expect(proposePatch({ ...context, source: "x".repeat(25000) })).rejects.toThrow();
  await expect(proposePatch({ ...context, evidence: "x".repeat(33000) })).rejects.toThrow();
  await expect(proposePatch({ ...context, evidenceIds: ["EV-001", "EV-001"] })).rejects.toThrow();
  await expect(proposePatch({ ...context, attemptNumber: 3 } as RepairContext)).rejects.toThrow();
});
