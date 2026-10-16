import { expect, test } from "bun:test";
import { parseRunInput } from "../../src/input";
import { DEFAULT_POLICY, TARGET_ID, SCENARIO_ID } from "../../src/types";

const input = {
  targetId: TARGET_ID,
  scenarioId: SCENARIO_ID,
  policyText: DEFAULT_POLICY,
  scenarioParameters: { delayMs: 800, repeatCount: 2 },
};

test("accepts only the declared synthetic scenario and bounded numeric parameters", () => {
  expect(parseRunInput(input).scenarioParameters).toEqual({ delayMs: 800, repeatCount: 2 });
  for (const invalid of [
    { targetId: "https://example.com" },
    { command: "echo success" },
    { scenarioParameters: { delayMs: "800", repeatCount: 2 } },
    { scenarioParameters: { delayMs: 800, repeatCount: 100 } },
    { scenarioParameters: { delayMs: 800, repeatCount: 2, path: "../" } },
    { policyText: "x".repeat(4097) },
    { policyText: "Credentials are secret: api_key=not-a-policy-value" },
  ]) expect(() => parseRunInput({ ...input, ...invalid })).toThrow();
});
