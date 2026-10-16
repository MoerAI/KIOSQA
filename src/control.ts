import { cp, mkdir, readFile, readdir, writeFile, lstat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runAcceptance } from "../runner/verify";
import { interpretPolicy, proposePatch } from "./model";
import { CloudEvidence, listFiles, protectedSnapshot, readableArtifact, writeExports } from "./artifacts";
import { InputError, parseRunInput } from "./input";
import { canRequestRepair, canVerify, classifyBaseline } from "./oracle";
import { hash, validatePatch } from "./patch";
import { SCENARIO_ID, TARGET_ID, TEST_IDS, type Approval, type Attempt, type Run, type RunPhase, type SuiteResult } from "./types";

const TERMINAL = new Set<RunPhase>(["complete", "failed", "needs_review"]);
const WAITING = new Set<RunPhase>(["awaiting_contract_approval", "baseline_ready", "awaiting_patch_approval"]);
const LIMITATIONS = [
  "One synthetic kiosk, one duplicate-checkout bug family, and simulated USD amounts only.",
  "Reviewed fixed-target execution with explicit contract and patch approval; not a hardened security sandbox or an autonomous deployment agent.",
  "Order and provider-ledger files are separate, directly observed fixture records. The target and simulated provider share a process and OS identity; this is not adversarial isolation.",
  "Single instance and scenario-lifetime keys only; no distributed durability, process-crash recovery, or retention-expiry claim.",
  "AT-04 lost-response recovery and inconsistent-payload conflict coverage are not claimed.",
  "Passing results are scoped empirical observations, not formal proof or production payment safety.",
];

function contractBytes(run: Run): string {
  return JSON.stringify({
    contract: run.contract,
    originalInput: run.input,
    targetId: run.targetId,
    scenarioId: run.scenarioId,
    baselineRevision: run.baselineRevision,
    expectedTestIds: [...TEST_IDS],
    deterministicOracle: {
      singleIntentOrders: 1,
      singleIntentCharges: 1,
      distinctIntentOrders: 2,
      distinctIntentCharges: 2,
      totalMinor: 1450,
      completionDeadlineMs: 5000,
    },
  }, null, 2) + "\n";
}

async function compileCandidate(root: string, workspace: string): Promise<NonNullable<Attempt["compile"]>> {
  const started = performance.now();
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit", "--strict", "--skipLibCheck",
      "--moduleResolution", "bundler", "--module", "esnext", "--target", "es2022", "--types", "bun", "--allowImportingTsExtensions",
      join(workspace, "target/checkout.ts"),
    ], { cwd: root, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30000);
    const append = (chunk: Buffer) => { if (output.length < 65536) output += chunk.toString(); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        executionStatus: timedOut ? "timed_out" : signal || code === null ? "infrastructure_error" : "completed",
        exitCode: code, signal, output, elapsedMs: Math.round(performance.now() - started),
      });
    });
  });
}

export class ControlPlane {
  readonly runs = new Map<string, Run>();
  readonly root: string;
  readonly runsRoot: string;
  readonly cloud: CloudEvidence;
  private activeRun?: string;
  private creating = false;
  private readonly subscribers = new Map<string, Set<(run: Run) => void>>();

  constructor(root: string, dataRoot = process.env.KIOSKPROOF_DATA_DIR ?? join(root, ".kioskproof")) {
    this.root = resolve(root);
    this.runsRoot = join(resolve(dataRoot), "runs");
    this.cloud = new CloudEvidence();
  }

  async initialize(): Promise<void> {
    await mkdir(this.runsRoot, { recursive: true });
    await this.cloud.restore(this.runsRoot);
    for (const entry of await readdir(this.runsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      const run = JSON.parse(await readFile(join(this.runsRoot, entry.name, "run.json"), "utf8")) as Run;
      if (run.id !== entry.name) throw new Error("Stored run identity mismatch.");
      this.runs.set(run.id, run);
      if (!TERMINAL.has(run.phase) && !WAITING.has(run.phase)) {
        run.phase = "failed";
        run.executionStatus = "infrastructure_error";
        run.verificationStatus = "inconclusive";
        run.error = "The service restarted during execution. No successful replay is claimed.";
        await this.save(run);
      } else if (WAITING.has(run.phase)) this.activeRun = run.id;
    }
  }

  directory(run: Run): string {
    return join(this.runsRoot, run.id);
  }

  get(id: string): Run {
    const run = this.runs.get(id);
    if (!run) throw new InputError("Run not found.", 404);
    return run;
  }

  list(): Run[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  subscribe(id: string, listener: (run: Run) => void): () => void {
    this.get(id);
    const listeners = this.subscribers.get(id) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.subscribers.delete(id);
    };
  }

  private event(run: Run, phase: RunPhase, message: string): void {
    run.phase = phase;
    run.updatedAt = new Date().toISOString();
    run.events.push({ timestamp: run.updatedAt, phase, message });
    console.info(JSON.stringify({ runId: run.id, phase, message }));
    if (TERMINAL.has(phase)) {
      run.durations.total = Date.now() - Date.parse(run.createdAt);
      if (this.activeRun === run.id) this.activeRun = undefined;
    }
  }

  private async save(run: Run, durable = false): Promise<void> {
    const previousSync = run.storage.syncedAt;
    if (durable && this.cloud.bucket) {
      run.storage.syncedAt = new Date().toISOString();
      delete run.storage.error;
    }
    await writeExports(this.directory(run), run);
    if (durable && this.cloud.bucket) {
      try {
        await this.cloud.sync(this.directory(run), run.id);
      } catch (error) {
        run.storage.syncedAt = previousSync;
        run.storage.error = error instanceof Error ? error.message : "Evidence synchronization failed.";
        await writeExports(this.directory(run), run);
      }
    }
    for (const listener of this.subscribers.get(run.id) ?? []) listener(run);
  }

  private launch(run: Run, phase: RunPhase, message: string, work: () => Promise<void>): void {
    const started = performance.now();
    this.activeRun = run.id;
    this.event(run, phase, message);
    void (async () => {
      try {
        await this.save(run);
        await work();
      } catch (error) {
        run.error = error instanceof Error ? error.message : "Unexpected execution failure.";
        run.durations[phase] = Math.round(performance.now() - started);
        if (phase === "analyzing" && run.attempts.at(-1)) {
          const attempt = run.attempts.at(-1)!;
          attempt.elapsedMs = run.durations[phase];
          attempt.patchStatus = "rejected";
          attempt.rejectionReason = run.error;
        }
        run.executionStatus = /timeout|timed out/i.test(run.error) ? "timed_out" : "infrastructure_error";
        run.verificationStatus = "inconclusive";
        run.verdict = "NOT_VERIFIED";
        this.event(run, "failed", run.error);
        await this.save(run, true);
      }
    })();
  }

  async create(input: unknown): Promise<Run> {
    if (this.creating || (this.activeRun && !TERMINAL.has(this.get(this.activeRun).phase))) {
      throw new InputError("One run is already active. Finish or reject its approval before creating another.", 409);
    }
    const parsed = parseRunInput(input);
    this.creating = true;
    try {
    const baselinePath = join(this.root, "target/checkout.ts");
    if ((await lstat(baselinePath)).isSymbolicLink()) throw new Error("Target source cannot be a symbolic link.");
    const source = await readFile(baselinePath, "utf8");
    const now = new Date().toISOString();
    const run: Run = {
      id: randomUUID(),
      targetId: TARGET_ID,
      scenarioId: SCENARIO_ID,
      input: parsed,
      createdAt: now,
      updatedAt: now,
      phase: "preparing",
      baselineRevision: `sha256:${hash(source)}`,
      executionStatus: "completed",
      baselineStatus: "inconclusive",
      verificationStatus: "not_run",
      humanApproval: "pending",
      verdict: "NOT_VERIFIED",
      executionMode: "reviewed_fixed_target",
      attempts: [],
      evidence: [],
      approvals: [],
      events: [],
      durations: {},
      storage: { mode: this.cloud.bucket ? "gcs" : "local", ...(this.cloud.bucket ? { bucket: this.cloud.bucket } : {}) },
      limitations: [...LIMITATIONS],
    };
    this.runs.set(run.id, run);
    this.activeRun = run.id;
    const workspace = join(this.directory(run), "workspaces/baseline");
    await mkdir(workspace, { recursive: true });
    await cp(join(this.root, "target"), join(workspace, "target"), { recursive: true, dereference: false });
    await writeFile(join(workspace, "target/checkout.ts"), source);
    this.launch(run, "preparing", "Google Antigravity is asking Gemini 4 Argon to interpret the operating rule.", async () => {
      const started = performance.now();
      const result = await interpretPolicy(parsed.policyText, parsed.scenarioParameters);
      run.contract = result.data;
      run.contractModel = result.meta;
      run.durations.policy = Math.round(performance.now() - started);
      run.contractHash = hash(contractBytes(run));
      if (result.data.interpretation !== "SUPPORTED") {
        this.event(run, "needs_review", "The policy is ambiguous or outside the supported duplicate-checkout contract.");
      } else {
        this.event(run, "awaiting_contract_approval", "Review the Argon contract and fixed acceptance cases before freezing them.");
      }
      await this.save(run, true);
    });
      return run;
    } finally {
      this.creating = false;
    }
  }

  approveContract(id: string, decision: string, expectedHash: string, actor: Approval["actor"] = "operator"): Run {
    const run = this.get(id);
    if (run.phase !== "awaiting_contract_approval") throw new InputError("The contract is not awaiting approval.", 409);
    if (!["approved", "rejected"].includes(decision) || expectedHash !== run.contractHash) {
      throw new InputError("Approval must refer to the displayed contract hash.", 409);
    }
    run.approvals.push({ action: "contract", decision: decision as "approved" | "rejected", actor, timestamp: new Date().toISOString(), contentHash: expectedHash });
    if (actor === "qa_driver") run.limitations.push("Approval actions in this rehearsal were simulated by the QA driver, not a human review or an event sandbox authorization.");
    run.humanApproval = decision as Run["humanApproval"];
    if (decision === "rejected") {
      this.event(run, "failed", "The operator rejected the proposed contract. No target code was executed.");
      void this.save(run, true);
      return run;
    }
    this.launch(run, "reproducing", "Freezing the approved contract and reproducing the seeded duplicate-order defect.", async () => {
      const started = performance.now();
      const snapshot = await protectedSnapshot(this.root);
      run.protectedFiles = snapshot.files;
      run.protectedHash = snapshot.hash;
      run.approvedContractVersion = 1;
      await writeFile(join(this.directory(run), "contract.json"), contractBytes(run));
      await writeFile(join(this.directory(run), "protected-suite.json"), JSON.stringify(snapshot, null, 2) + "\n");
      const output = join(this.directory(run), "before");
      run.baseline = await this.executeSuite(run, join(this.directory(run), "workspaces/baseline"), output);
      run.executionStatus = run.baseline.executionStatus;
      run.baselineStatus = classifyBaseline(run.baseline);
      run.durations.baseline = Math.round(performance.now() - started);
      if (run.baselineStatus === "reproduced") {
        this.event(run, "baseline_ready", "The frozen baseline reproduced duplicate orders and provider-owned simulated charges.");
      } else {
        run.verificationStatus = "inconclusive";
        this.event(run, "failed", `Baseline ${run.baselineStatus}. A verified repair cannot be claimed.`);
      }
      await this.save(run, true);
    });
    return run;
  }

  requestRepair(id: string): Run {
    const run = this.get(id);
    const previous = run.attempts.at(-1);
    if (!canRequestRepair(run)) {
      throw new InputError("Repair requires a reproduced baseline and an available attempt (maximum two).", 409);
    }
    if (this.activeRun && this.activeRun !== run.id) throw new InputError("Another run is active.", 409);
    const attempt: Attempt = { number: run.attempts.length + 1, patchStatus: "proposed", approval: "pending", elapsedMs: 0 };
    run.attempts.push(attempt);
    delete run.error;
    this.launch(run, "analyzing", "Antigravity is giving Gemini 4 Argon the frozen policy, screenshots, request log, observations, and bounded source.", async () => {
      const started = performance.now();
      const source = await readFile(join(this.directory(run), "workspaces/baseline/target/checkout.ts"), "utf8");
      const supportingSource = await readFile(join(this.directory(run), "workspaces/baseline/target/types.ts"), "utf8");
      const selectedEvidence = run.evidence.filter((item) => item.phase === "before" && ["machine_result", "screenshot"].includes(item.type)).slice(0, 24);
      const evidenceIds = selectedEvidence.map((item) => item.evidenceId);
      const diagnosticEvidence = {
        executionStatus: run.baseline!.executionStatus,
        expectedTestIds: run.baseline!.expectedTestIds,
        catalog: selectedEvidence.map((item) => ({
          evidenceId: item.evidenceId, type: item.type, path: item.relativeArtifactPath, source: item.source, contentHash: item.contentHash,
        })),
        tests: run.baseline!.tests.map((test) => ({
          id: test.id,
          status: test.status,
          error: test.error?.slice(0, 1500),
          orderObservation: test.orderObservation,
          paymentObservation: test.paymentObservation,
          requests: test.requests,
        })),
      };
      const result = await proposePatch({
        policyText: run.input.policyText,
        contract: run.contract!,
        baselineRevision: run.baselineRevision,
        source,
        supportingSource,
        evidence: JSON.stringify(diagnosticEvidence),
        evidenceIds,
        screenshotPaths: (run.baseline?.screenshotPaths ?? []).slice(0, 2).map((path) => join(this.directory(run), path)),
        attemptNumber: attempt.number,
        ...(previous?.suite ? { previousFailure: JSON.stringify(previous.suite.tests.map((test) => ({
          id: test.id, status: test.status, error: test.error?.slice(0, 400),
          orders: test.orderObservation?.records.length, charges: test.paymentObservation?.records.length,
        }))) } : previous?.compile ? { previousFailure: JSON.stringify({
          executionStatus: previous.compile.executionStatus,
          exitCode: previous.compile.exitCode,
          output: Buffer.from(previous.compile.output).subarray(0, 1500).toString("utf8"),
        }) } : {}),
      });
      attempt.model = result.meta;
      attempt.proposal = result.data;
      attempt.elapsedMs = Math.round(performance.now() - started);
      run.durations[`analysis-${attempt.number}`] = attempt.elapsedMs;
      await writeFile(join(this.directory(run), `patch-${attempt.number}.diff`), result.data.diff);
      try {
        const checked = validatePatch(result.data.diff, source);
        if (
          result.data.baselineRevision !== run.baselineRevision ||
          result.data.attemptNumber !== attempt.number ||
          JSON.stringify(result.data.changedPaths) !== JSON.stringify(checked.changedPaths) ||
          !result.data.evidenceIds.length ||
          result.data.evidenceIds.some((evidenceId) => !evidenceIds.includes(evidenceId))
        ) throw new Error("Patch provenance, changed paths, or evidence references do not match this run.");
        attempt.patchHash = checked.patchHash;
      } catch (error) {
        attempt.patchStatus = "rejected";
        attempt.rejectionReason = error instanceof Error ? error.message : "Invalid patch.";
        this.event(run, "failed", `Candidate rejected without execution: ${attempt.rejectionReason}`);
        await this.save(run, true);
        return;
      }
      this.event(run, "awaiting_patch_approval", "Review the actual Argon application diff before fixed-target execution.");
      await this.save(run, true);
    });
    return run;
  }

  approvePatch(id: string, decision: string, expectedHash: string, actor: Approval["actor"] = "operator"): Run {
    const run = this.get(id);
    const attempt = run.attempts.at(-1);
    if (run.phase !== "awaiting_patch_approval" || !attempt?.proposal || !attempt.patchHash) {
      throw new InputError("No validated patch is awaiting review.", 409);
    }
    if (!["approved", "rejected"].includes(decision) || expectedHash !== attempt.patchHash) throw new InputError("Approval must refer to the displayed patch hash.", 409);
    attempt.approval = decision as Attempt["approval"];
    run.approvals.push({ action: "patch", decision: decision as "approved" | "rejected", actor, timestamp: new Date().toISOString(), contentHash: expectedHash });
    if (decision === "rejected") {
      attempt.patchStatus = "rejected";
      run.humanApproval = "rejected";
      this.event(run, "failed", "The operator rejected the patch. The candidate was not executed.");
      void this.save(run, true);
      return run;
    }
    this.launch(run, "patching", "Applying the reviewed application-only diff in a fresh disposable workspace.", async () => {
      const started = performance.now();
      const original = join(this.directory(run), "workspaces/baseline");
      const candidate = join(this.directory(run), `workspaces/candidate-${attempt.number}`);
      const source = await readFile(join(original, "target/checkout.ts"), "utf8");
      const checked = validatePatch(attempt.proposal!.diff, source);
      if (checked.patchHash !== expectedHash) throw new Error("Patch changed after approval.");
      await cp(original, candidate, { recursive: true, dereference: false });
      await writeFile(join(candidate, "target/checkout.ts"), checked.source);
      attempt.patchStatus = "applied_in_sandbox";
      attempt.candidateRevision = `sha256:${hash(checked.source)}`;
      attempt.compile = await compileCandidate(this.root, candidate);
      await writeFile(join(this.directory(run), `compile-${attempt.number}.log`), attempt.compile.output || `Exit code: ${attempt.compile.exitCode}\n`);
      if (attempt.compile.executionStatus !== "completed" || attempt.compile.exitCode !== 0) {
        attempt.patchStatus = "compile_failed";
        run.executionStatus = attempt.compile.executionStatus;
        attempt.elapsedMs += Math.round(performance.now() - started);
        run.verificationStatus = attempt.compile.executionStatus === "completed" ? "failed" : "inconclusive";
        this.event(run, "failed", "Candidate compilation failed. No passing verification is claimed.");
        await this.save(run, true);
        return;
      }
      this.event(run, "verifying", "Executing the unchanged trusted Playwright suite and reading order/provider observations.");
      await this.save(run);
      const output = join(this.directory(run), `after-${attempt.number}`);
      attempt.suite = await this.executeSuite(run, candidate, output);
      run.executionStatus = attempt.suite.executionStatus;
      const snapshot = await protectedSnapshot(this.root);
      const storedContract = await readFile(join(this.directory(run), "contract.json"));
      attempt.protectedHashesMatch = snapshot.hash === run.protectedHash && hash(storedContract) === run.contractHash && hash(contractBytes(run)) === run.contractHash;
      const paths = [...new Set([
        ...(run.baseline?.artifactPaths ?? []), ...attempt.suite.artifactPaths,
        ...(run.baseline?.tests.flatMap((test) => test.attachments) ?? []),
        ...attempt.suite.tests.flatMap((test) => test.attachments),
        run.baseline!.reportPath, run.baseline!.resultPath, attempt.suite.reportPath, attempt.suite.resultPath,
      ])];
      const readable = paths.length > 0 && (run.baseline?.screenshotPaths.length ?? 0) > 0 && attempt.suite.screenshotPaths.length > 0 &&
        (await Promise.all(paths.map((path) => readableArtifact(this.directory(run), path)))).every(Boolean);
      const verified = canVerify(run, attempt.suite, attempt.protectedHashesMatch, readable);
      run.verificationStatus = verified ? "passed" : attempt.suite.executionStatus === "completed" && attempt.protectedHashesMatch && readable ? "failed" : "inconclusive";
      run.verdict = verified ? "VERIFIED_IN_SCOPE" : "NOT_VERIFIED";
      attempt.elapsedMs += Math.round(performance.now() - started);
      run.durations[`verification-${attempt.number}`] = Math.round(performance.now() - started);
      run.durations.total = Date.now() - Date.parse(run.createdAt);
      this.event(run, verified ? "complete" : "failed", verified
        ? "VERIFIED_IN_SCOPE: reproduced baseline, unchanged contract, all five protected cases passed, and readable independent evidence."
        : `Verification ${run.verificationStatus}. Every failed attempt and its evidence remain available.`);
      await this.save(run, true);
    });
    return run;
  }

  private async executeSuite(run: Run, workspace: string, output: string): Promise<SuiteResult> {
    const directory = this.directory(run);
    const startedAt = new Date().toISOString();
    run.liveSuite = {
      phase: relative(directory, output).split(sep).join("/"),
      startedAt,
      updatedAt: startedAt,
      tests: TEST_IDS.map((id) => ({ id, title: id, status: "queued", timestamp: startedAt })),
    };
    for (const listener of this.subscribers.get(run.id) ?? []) listener(run);
    const suite = await runAcceptance({
      workspace,
      outputDir: output,
      scenario: run.input.scenarioParameters,
      onProgress: (progress) => {
        const index = run.liveSuite?.tests.findIndex((test) => test.id === progress.id) ?? -1;
        if (index < 0 || !run.liveSuite) return;
        run.liveSuite.tests[index] = progress;
        run.liveSuite.updatedAt = progress.timestamp;
        run.updatedAt = progress.timestamp;
        for (const listener of this.subscribers.get(run.id) ?? []) listener(run);
      },
    });
    const normalize = (path: string) => {
      const absolute = resolve(path.startsWith("/") ? path : join(output, path));
      const result = relative(directory, absolute).split(sep).join("/");
      if (result.startsWith("..") || result.startsWith("/")) throw new Error("Runner returned evidence outside this run.");
      return result;
    };
    const nativeReport = join(output, "playwright-html/index.html");
    if (await readableArtifact(directory, relative(directory, nativeReport))) {
      suite.reportPath = normalize(nativeReport);
    } else {
      suite.reportPath = normalize(suite.reportPath);
      suite.infrastructureErrors.push("The native Playwright HTML report is missing or unreadable.");
      suite.executionStatus = "infrastructure_error";
    }
    suite.resultPath = normalize(suite.resultPath);
    suite.screenshotPaths = suite.screenshotPaths.map(normalize);
    for (const test of suite.tests) {
      test.attachments = test.attachments.map(normalize);
      for (const observation of [test.orderObservation, test.paymentObservation]) {
        if (observation) observation.source = observation.source.replaceAll(this.root, "[workspace]");
      }
      if (test.error) test.error = test.error.replaceAll(this.root, "[workspace]");
    }
    const files = await listFiles(output);
    suite.artifactPaths = files.map(normalize);
    for (const path of files) {
      const artifact = normalize(path);
      const content = await readFile(path);
      run.evidence.push({
        evidenceId: `EV-${String(run.evidence.length + 1).padStart(3, "0")}`,
        runId: run.id,
        phase: relative(directory, output),
        timestamp: new Date().toISOString(),
        type: path.endsWith(".png") ? "screenshot" : path.endsWith(".zip") ? "trace" : path.endsWith(".webm") ? "video" : path.endsWith(".json") ? "machine_result" : "runner_artifact",
        relativeArtifactPath: artifact,
        source: "Trusted Playwright runner; direct order-file observation and runner-owned simulated-provider ledger.",
        contentHash: hash(content),
        redactionStatus: "synthetic_only",
      });
    }
    return suite;
  }
}
