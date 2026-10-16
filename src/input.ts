import { DEFAULT_POLICY, SCENARIO_ID, TARGET_ID, type Scenario } from "./types";

export class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function parseRunInput(value: unknown): { policyText: string; scenarioParameters: Scenario } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected a JSON object.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["targetId", "scenarioId", "policyText", "scenarioParameters"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new InputError("Unsupported input field.");
  if (input.targetId !== TARGET_ID || input.scenarioId !== SCENARIO_ID) {
    throw new InputError("Only the fixed synthetic-checkout target and duplicate-checkout scenario are supported.");
  }
  const policyText = input.policyText ?? DEFAULT_POLICY;
  if (
    typeof policyText !== "string" ||
    policyText.trim().length < 30 ||
    Buffer.byteLength(policyText) > 4096 ||
    /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(policyText)
  ) {
    throw new InputError("Policy must be 30 to 4096 bytes of plain text.");
  }
  if (
    /AIza[0-9A-Za-z_-]{20,}|-----BEGIN [\w ]*PRIVATE KEY-----|(?:api[_ -]?key|access[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*\S+/i.test(policyText)
  ) {
    throw new InputError("Do not submit credentials or secrets.");
  }
  const scenario = input.scenarioParameters;
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) throw new InputError("Scenario parameters are required.");
  const parameters = scenario as Record<string, unknown>;
  if (
    Object.keys(parameters).some((key) => key !== "delayMs" && key !== "repeatCount") ||
    ![200, 800, 1500].includes(parameters.delayMs as number) ||
    ![2, 3].includes(parameters.repeatCount as number)
  ) {
    throw new InputError("Supported provider delays: 200/800/1500 ms. Supported repeated actions: 2/3.");
  }
  return { policyText: policyText.trim(), scenarioParameters: parameters as unknown as Scenario };
}
