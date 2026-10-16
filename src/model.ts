import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validatePatch } from "./patch";
import type { ModelMeta, ModelResult, PatchProposal, ProposedContract, RepairContext, Scenario } from "./types";

const MODEL_ID = "gemini-4-argon";
const TARGET_PATH = "target/checkout.ts";
const MAX_BRIDGE_INPUT_BYTES = 98_304;
const MAX_BRIDGE_OUTPUT_BYTES = 49_152;
const MAX_POLICY_BYTES = 4_096;
const MAX_SOURCE_BYTES = 24_576;
const MAX_SUPPORTING_SOURCE_BYTES = 24_576;
const MAX_EVIDENCE_BYTES = 32_768;
const MAX_SCREENSHOTS = 4;

export interface AgentRuntimeProbe {
  runtime: "google-antigravity";
  sdkVersion: string;
  modelId: typeof MODEL_ID;
  apiVersion: string;
  apiKeyAvailable: boolean;
  toolsDenied: true;
}

class ModelBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelBridgeError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(value: string, errorMessage: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    // The bridge contract is a single JSON object. Do not surface raw output.
  }
  throw new ModelBridgeError(errorMessage);
}

function hasOnlyKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isBoundedString(value: unknown, maximum: number, minimum = 1): value is string {
  return (
    typeof value === "string" &&
    !value.includes("\0") &&
    Buffer.byteLength(value, "utf8") >= minimum &&
    Buffer.byteLength(value, "utf8") <= maximum
  );
}

function parseStringList(value: unknown, maximumItems: number, maximumItemBytes: number, minimumItems = 0): string[] {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    throw new ModelBridgeError("Google Antigravity returned an invalid list field.");
  }
  if (!value.every((item) => isBoundedString(item, maximumItemBytes) && item.trim().length > 0)) {
    throw new ModelBridgeError("Google Antigravity returned an invalid list item.");
  }
  return value;
}

function parseMeta(value: unknown): ModelMeta {
  if (!isRecord(value) || !hasOnlyKeys(value, ["runtime", "sdkVersion", "modelId", "apiVersion", "elapsedMs", "usage", "conversationId"])) {
    throw new ModelBridgeError("Google Antigravity returned invalid usage metadata.");
  }
  if (
    value.runtime !== "google-antigravity" ||
    value.modelId !== MODEL_ID ||
    !isBoundedString(value.sdkVersion, 64) ||
    !isBoundedString(value.apiVersion, 64) ||
    !Number.isSafeInteger(value.elapsedMs) ||
    (value.elapsedMs as number) < 0 ||
    (value.elapsedMs as number) > 900_000 ||
    (value.conversationId !== undefined && !isBoundedString(value.conversationId, 256))
  ) {
    throw new ModelBridgeError("Google Antigravity returned malformed runtime metadata.");
  }
  const elapsedMs = value.elapsedMs;
  if (typeof elapsedMs !== "number") throw new ModelBridgeError("Google Antigravity returned malformed runtime metadata.");
  let usage: Record<string, number> | null = null;
  if (value.usage !== null && value.usage !== undefined) {
    if (!isRecord(value.usage) || Object.keys(value.usage).length > 16) {
      throw new ModelBridgeError("Google Antigravity returned malformed token usage.");
    }
    const entries = Object.entries(value.usage);
    if (!entries.every(([key, count]) => /^[a-z][a-z_]{0,63}$/.test(key) && typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) {
      throw new ModelBridgeError("Google Antigravity returned malformed token usage.");
    }
    usage = Object.fromEntries(entries) as Record<string, number>;
  }
  return {
    runtime: "google-antigravity",
    sdkVersion: value.sdkVersion,
    modelId: MODEL_ID,
    apiVersion: value.apiVersion,
    elapsedMs,
    usage,
    ...(value.conversationId === undefined ? {} : { conversationId: value.conversationId }),
  };
}

function parseContract(value: unknown): ProposedContract {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["ruleId", "version", "interpretation", "reviewReason", "scope", "preconditions", "actions", "expectedOutcome", "evidenceSources"]) ||
    value.ruleId !== "POL-001" ||
    value.version !== 1 ||
    (value.interpretation !== "SUPPORTED" && value.interpretation !== "NEEDS_REVIEW") ||
    !isBoundedString(value.reviewReason, 1_000, 0) ||
    !isBoundedString(value.scope, 1_000) ||
    !isBoundedString(value.expectedOutcome, 1_000)
  ) {
    throw new ModelBridgeError("Google Antigravity returned an invalid policy contract.");
  }
  const contract: ProposedContract = {
    ruleId: "POL-001",
    version: 1,
    interpretation: value.interpretation,
    reviewReason: value.reviewReason,
    scope: value.scope,
    preconditions: parseStringList(value.preconditions, 12, 1_000, 1),
    actions: parseStringList(value.actions, 12, 1_000, 1),
    expectedOutcome: value.expectedOutcome,
    evidenceSources: parseStringList(value.evidenceSources, 12, 1_000, 1),
  };
  if (contract.interpretation === "NEEDS_REVIEW" && !contract.reviewReason.trim()) {
    throw new ModelBridgeError("Google Antigravity did not explain why policy review is required.");
  }
  return contract;
}

function parsePatch(value: unknown, context: RepairContext): PatchProposal {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["baselineRevision", "diff", "changedPaths", "rationale", "evidenceIds", "observations", "hypotheses", "attemptNumber"]) ||
    value.baselineRevision !== context.baselineRevision ||
    value.attemptNumber !== context.attemptNumber ||
    !isBoundedString(value.diff, 32_768) ||
    value.diff.includes("\r") ||
    !isBoundedString(value.rationale, 3_000)
  ) {
    throw new ModelBridgeError("Google Antigravity returned an invalid patch proposal.");
  }
  const changedPaths = parseStringList(value.changedPaths, 1, 128, 1);
  if (changedPaths.length !== 1 || changedPaths[0] !== TARGET_PATH || !isTargetOnlyDiff(value.diff)) {
    throw new ModelBridgeError("Google Antigravity proposed a patch outside target/checkout.ts.");
  }
  try {
    const checked = validatePatch(value.diff, context.source);
    if (checked.changedPaths.length !== 1 || checked.changedPaths[0] !== TARGET_PATH) {
      throw new Error("proposal changed an unsupported path");
    }
  } catch {
    throw new ModelBridgeError("Google Antigravity returned a diff that does not apply to the exact supplied source.");
  }
  const evidenceIds = parseStringList(value.evidenceIds, 50, 128);
  if (!evidenceIds.every((evidenceId) => context.evidenceIds.includes(evidenceId))) {
    throw new ModelBridgeError("Google Antigravity cited evidence that was not supplied by the runner.");
  }
  if (context.evidenceIds.length > 0 && evidenceIds.length === 0) {
    throw new ModelBridgeError("Google Antigravity did not cite the supplied evidence.");
  }
  return {
    baselineRevision: context.baselineRevision,
    diff: value.diff,
    changedPaths: [TARGET_PATH],
    rationale: value.rationale,
    evidenceIds,
    observations: parseStringList(value.observations, 16, 1_000, 1),
    hypotheses: parseStringList(value.hypotheses, 16, 1_000),
    attemptNumber: context.attemptNumber,
  };
}

function isTargetOnlyDiff(diff: string): boolean {
  const lines = diff.split("\n");
  let index = 0;
  if (lines[index] === `diff --git a/${TARGET_PATH} b/${TARGET_PATH}`) {
    index += 1;
    if (/^index [a-f0-9]+\.\.[a-f0-9]+(?: 100644)?$/.test(lines[index] ?? "")) index += 1;
  }
  if (lines[index] !== `--- a/${TARGET_PATH}` || lines[index + 1] !== `+++ b/${TARGET_PATH}`) return false;
  return (
    lines.slice(index + 2).some((line) => line.startsWith("@@ ")) &&
    !lines.slice(index + 2).some((line) => line.startsWith("--- ") || line.startsWith("+++ "))
  );
}

function validatePolicyRequest(policyText: string, scenario: Scenario): void {
  if (!isBoundedString(policyText, MAX_POLICY_BYTES, 30) || /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(policyText)) {
    throw new ModelBridgeError("Policy input must be 30 to 4096 bytes of plain text.");
  }
  if (![200, 800, 1500].includes(scenario.delayMs) || ![2, 3].includes(scenario.repeatCount)) {
    throw new ModelBridgeError("Only the declared duplicate-checkout scenario parameters are supported.");
  }
}

function validateRepairRequest(context: RepairContext): void {
  validatePolicyRequest(context.policyText, { delayMs: 200, repeatCount: 2 });
  if (
    !isBoundedString(context.baselineRevision, 128) ||
    !isBoundedString(context.source, MAX_SOURCE_BYTES) ||
    !context.source.endsWith("\n") ||
    !isBoundedString(context.supportingSource, MAX_SUPPORTING_SOURCE_BYTES) ||
    !isBoundedString(context.evidence, MAX_EVIDENCE_BYTES) ||
    context.screenshotPaths.length > MAX_SCREENSHOTS ||
    !context.screenshotPaths.every((path) => typeof path === "string" && path.length > 0 && path.length <= 4_096) ||
    ![1, 2].includes(context.attemptNumber) ||
    (context.previousFailure !== undefined && !isBoundedString(context.previousFailure, 4_096))
  ) {
    throw new ModelBridgeError("Repair input exceeds the bounded Google Antigravity request contract.");
  }
  if (
    context.evidenceIds.length > 50 ||
    new Set(context.evidenceIds).size !== context.evidenceIds.length ||
    !context.evidenceIds.every((id) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id))
  ) {
    throw new ModelBridgeError("Repair evidence IDs are invalid.");
  }
  parseContract(context.contract);
}

async function invokeBridge(request: JsonRecord): Promise<JsonRecord> {
  const input = JSON.stringify(request);
  if (Buffer.byteLength(input, "utf8") > MAX_BRIDGE_INPUT_BYTES) {
    throw new ModelBridgeError("Google Antigravity bridge input exceeds its accepted size.");
  }
  const python = process.env.ANTIGRAVITY_PYTHON?.trim() || ".venv/bin/python";
  const bridgePath = fileURLToPath(new URL("../agents/antigravity_bridge.py", import.meta.url));
  const child = spawn(python, [bridgePath], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  const stdout = await collectProcessOutput(child, input);
  const payload = parseJsonRecord(stdout.output, "Google Antigravity bridge returned invalid JSON.");
  if (child.exitCode !== 0) {
    const error = isRecord(payload.error) && isBoundedString(payload.error.message, 500) ? payload.error.message : "Google Antigravity bridge failed.";
    throw new ModelBridgeError(error);
  }
  return payload;
}

async function collectProcessOutput(child: ReturnType<typeof spawn>, input: string): Promise<{ output: string }> {
  const childStdout = child.stdout;
  const childStderr = child.stderr;
  const childStdin = child.stdin;
  if (!childStdout || !childStderr || !childStdin) {
    throw new ModelBridgeError("Google Antigravity bridge did not expose standard I/O.");
  }
  return await new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    let stdoutSize = 0;
    let overflow = false;
    const stopForOverflow = (): void => {
      overflow = true;
      child.kill("SIGKILL");
    };
    childStdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_BRIDGE_OUTPUT_BYTES) return stopForOverflow();
      stdout.push(chunk);
    });
    childStderr.resume();
    child.once("error", () => reject(new ModelBridgeError("Google Antigravity Python runtime could not be started.")));
    child.once("close", (code) => {
      if (overflow) return reject(new ModelBridgeError("Google Antigravity bridge output exceeded its accepted size."));
      const output = Buffer.concat(stdout).toString("utf8");
      if (!output.trim()) {
        return reject(new ModelBridgeError("Google Antigravity bridge produced no result; inspect the trusted service runtime."));
      }
      if (code === null) return reject(new ModelBridgeError("Google Antigravity bridge was terminated before it returned a result."));
      resolve({ output });
    });
    childStdin.end(input, "utf8");
  });
}

export async function interpretPolicy(policyText: string, scenario: Scenario): Promise<ModelResult<ProposedContract>> {
  validatePolicyRequest(policyText, scenario);
  const payload = await invokeBridge({ action: "interpret_policy", policyText, scenario });
  if (!hasOnlyKeys(payload, ["data", "meta"])) throw new ModelBridgeError("Google Antigravity returned an unexpected policy result.");
  return { data: parseContract(payload.data), meta: parseMeta(payload.meta) };
}

export async function proposePatch(context: RepairContext): Promise<ModelResult<PatchProposal>> {
  validateRepairRequest(context);
  const payload = await invokeBridge({ action: "propose_patch", ...context });
  if (!hasOnlyKeys(payload, ["data", "meta"])) throw new ModelBridgeError("Google Antigravity returned an unexpected patch result.");
  return { data: parsePatch(payload.data, context), meta: parseMeta(payload.meta) };
}

export async function probeAgentRuntime(): Promise<AgentRuntimeProbe> {
  const payload = await invokeBridge({ action: "probe" });
  if (
    !hasOnlyKeys(payload, ["runtime", "sdkVersion", "modelId", "apiVersion", "apiKeyAvailable", "toolsDenied"]) ||
    payload.runtime !== "google-antigravity" ||
    payload.modelId !== MODEL_ID ||
    !isBoundedString(payload.sdkVersion, 64) ||
    !isBoundedString(payload.apiVersion, 64) ||
    typeof payload.apiKeyAvailable !== "boolean" ||
    payload.toolsDenied !== true
  ) {
    throw new ModelBridgeError("Google Antigravity runtime probe returned invalid metadata.");
  }
  return {
    runtime: "google-antigravity",
    sdkVersion: payload.sdkVersion,
    modelId: MODEL_ID,
    apiVersion: payload.apiVersion,
    apiKeyAvailable: payload.apiKeyAvailable,
    toolsDenied: true,
  };
}
