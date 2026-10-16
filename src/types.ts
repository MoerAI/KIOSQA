export const TEST_IDS = ["AT-01", "AT-02", "AT-03", "AT-05", "AT-06"] as const;
export const TARGET_ID = "synthetic-checkout";
export const SCENARIO_ID = "duplicate-checkout";
export const DEFAULT_POLICY =
  "POL-001: For one purchase intent, concurrent duplicate delivery of an identical checkout request must create exactly one order and one simulated charge within five seconds after the controlled provider barrier is released. A new purchase intent must still create a new order.";

export interface Scenario {
  delayMs: 200 | 800 | 1500;
  repeatCount: 2 | 3;
}

export interface ProposedContract {
  ruleId: "POL-001";
  version: 1;
  interpretation: "SUPPORTED" | "NEEDS_REVIEW";
  reviewReason: string;
  scope: string;
  preconditions: string[];
  actions: string[];
  expectedOutcome: string;
  evidenceSources: string[];
}

export interface ModelMeta {
  runtime: "google-antigravity";
  sdkVersion: string;
  modelId: string;
  apiVersion: string;
  elapsedMs: number;
  usage: Record<string, number> | null;
  conversationId?: string;
}

export interface ModelResult<T> {
  data: T;
  meta: ModelMeta;
}

export interface PatchProposal {
  baselineRevision: string;
  diff: string;
  changedPaths: string[];
  rationale: string;
  evidenceIds: string[];
  observations: string[];
  hypotheses: string[];
  attemptNumber: number;
}

export interface RepairContext {
  policyText: string;
  contract: ProposedContract;
  baselineRevision: string;
  source: string;
  supportingSource: string;
  evidence: string;
  evidenceIds: string[];
  screenshotPaths: string[];
  attemptNumber: number;
  previousFailure?: string;
}

export interface StateObservation {
  source: string;
  records: Record<string, unknown>[];
}

export interface TestResult {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  durationMs: number;
  error?: string;
  orderObservation?: StateObservation;
  paymentObservation?: StateObservation;
  requests?: Record<string, unknown>[];
  attachments: string[];
}

export interface TestProgress {
  id: string;
  title: string;
  status: "queued" | "running" | TestResult["status"];
  timestamp: string;
  durationMs?: number;
  error?: string;
}

export interface SuiteResult {
  executionStatus: "completed" | "infrastructure_error" | "timed_out" | "cancelled";
  processExitCode: number | null;
  tests: TestResult[];
  expectedTestIds: string[];
  skippedCount: number;
  infrastructureErrors: string[];
  elapsedMs: number;
  reportPath: string;
  resultPath: string;
  screenshotPaths: string[];
  artifactPaths: string[];
}

export interface EvidenceItem {
  evidenceId: string;
  runId: string;
  phase: string;
  timestamp: string;
  type: string;
  relativeArtifactPath: string;
  source: string;
  contentHash: string;
  redactionStatus: "synthetic_only";
}

export interface Approval {
  action: "contract" | "patch";
  timestamp: string;
  contentHash: string;
  decision: "approved" | "rejected";
  actor: "operator" | "qa_driver";
}

export interface Attempt {
  number: number;
  proposal?: PatchProposal;
  model?: ModelMeta;
  patchHash?: string;
  patchStatus: "proposed" | "rejected" | "applied_in_sandbox" | "compile_failed";
  approval: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  compile?: {
    executionStatus: "completed" | "infrastructure_error" | "timed_out";
    exitCode: number | null;
    signal: string | null;
    output: string;
    elapsedMs: number;
  };
  suite?: SuiteResult;
  protectedHashesMatch?: boolean;
  candidateRevision?: string;
  elapsedMs: number;
}

export type RunPhase =
  | "preparing"
  | "awaiting_contract_approval"
  | "needs_review"
  | "reproducing"
  | "baseline_ready"
  | "analyzing"
  | "awaiting_patch_approval"
  | "patching"
  | "verifying"
  | "failed"
  | "complete";

export interface Run {
  id: string;
  targetId: typeof TARGET_ID;
  scenarioId: typeof SCENARIO_ID;
  createdAt: string;
  updatedAt: string;
  phase: RunPhase;
  input: { policyText: string; scenarioParameters: Scenario };
  baselineRevision: string;
  contract?: ProposedContract;
  contractModel?: ModelMeta;
  contractHash?: string;
  protectedHash?: string;
  protectedFiles?: Record<string, string>;
  approvedContractVersion?: number;
  executionStatus: SuiteResult["executionStatus"];
  baselineStatus: "reproduced" | "not_reproduced" | "inconclusive";
  verificationStatus: "passed" | "failed" | "inconclusive" | "not_run";
  humanApproval: "pending" | "approved" | "rejected";
  verdict: "VERIFIED_IN_SCOPE" | "NOT_VERIFIED";
  executionMode: "reviewed_fixed_target";
  baseline?: SuiteResult;
  attempts: Attempt[];
  evidence: EvidenceItem[];
  approvals: Approval[];
  events: { timestamp: string; phase: RunPhase; message: string }[];
  durations: Record<string, number>;
  liveSuite?: {
    phase: string;
    startedAt: string;
    updatedAt: string;
    tests: TestProgress[];
  };
  error?: string;
  storage: { mode: "local" | "gcs"; bucket?: string; syncedAt?: string; error?: string };
  limitations: string[];
}
