import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_IDS, type Scenario, type StateObservation, type SuiteResult, type TestProgress, type TestResult } from "../src/types.ts";
import { PROGRESS_EVENT_KIND } from "./progress-reporter.ts";

export interface RunAcceptanceOptions {
  workspace: string;
  outputDir: string;
  scenario: Scenario;
  onProgress?: (event: TestProgress) => void;
}

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string;
}

interface Attachment {
  name: string;
  path?: string;
  body?: string;
}

const EXPECTED_IDS = [...TEST_IDS];
const OBSERVED_TEST_IDS = EXPECTED_IDS.filter((id) => id !== "AT-06");
const MAX_PROGRESS_EVENT_BYTES = 8_192;
const MAX_PROGRESS_TITLE_BYTES = 1_024;
const MAX_PROGRESS_ERROR_BYTES = 4_096;

export async function runAcceptance(options: RunAcceptanceOptions): Promise<SuiteResult> {
  const startedAt = Date.now();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const workspace = resolve(options.workspace);
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const infrastructureErrors = validateScenario(options.scenario);
  await validateWorkspace(workspace, infrastructureErrors);
  const packageVersion = await readPackageVersion(join(root, "package.json"));
  if (packageVersion !== "1.64.1") {
    infrastructureErrors.push(`Playwright package must be pinned to 1.64.1; found ${packageVersion ?? "missing"}.`);
  }

  const protectedPaths = [
    join(root, "playwright.acceptance.config.ts"),
    join(root, "tests", "acceptance", "checkout.acceptance.spec.ts"),
  ];
  const protectedBefore = await hashFiles(protectedPaths, infrastructureErrors);
  const reporterPath = join(outputDir, "playwright-results.json");
  const commandLogPath = join(outputDir, "playwright-command.log");
  let processResult: ProcessResult | undefined;

  if (infrastructureErrors.length === 0) {
    processResult = await runPlaywright(root, workspace, outputDir, options.scenario, options.onProgress);
    await writeFile(commandLogPath, formatProcessResult(processResult), "utf8");
    if (processResult.error) infrastructureErrors.push(processResult.error);
    if (processResult.signal) infrastructureErrors.push(`Playwright exited from signal ${processResult.signal}.`);
  } else {
    await writeFile(commandLogPath, "Playwright was not started because preflight validation failed.\n", "utf8");
  }

  const protectedAfter = await hashFiles(protectedPaths, infrastructureErrors);
  for (const path of protectedPaths) {
    if (protectedBefore.get(path) !== protectedAfter.get(path)) {
      infrastructureErrors.push(`Protected verification input changed during execution: ${relative(root, path)}.`);
    }
  }
  const sourceCheck = await readProtectedSources(protectedPaths, infrastructureErrors);
  if (/\b(?:test|describe)\.(?:skip|fixme|only)\s*\(/.test(sourceCheck)) {
    infrastructureErrors.push("Protected acceptance source contains skip, fixme, or only.");
  }

  const parsed = await parseReporter(reporterPath, outputDir, infrastructureErrors);
  const tests = parsed.tests;
  validateExpectedResults(tests, infrastructureErrors);
  const skippedCount = tests.filter((result) => result.status === "skipped").length;
  if (skippedCount > 0) infrastructureErrors.push(`Acceptance suite reported ${skippedCount} skipped test(s).`);
  validateEvidence(tests, infrastructureErrors);
  validateFailures(tests, infrastructureErrors);
  if (processResult && processResult.exitCode !== (tests.some((test) => test.status === "failed") ? 1 : 0)) {
    infrastructureErrors.push(`Playwright exit code ${String(processResult.exitCode)} does not match the recorded test results.`);
  }
  if (processResult && processResult.exitCode === null && !processResult.signal) {
    infrastructureErrors.push("Playwright did not produce an exit code.");
  }

  let artifactPaths = await listFiles(outputDir);
  const screenshotPaths = artifactPaths.filter((path) => /\.(png|jpe?g)$/i.test(path));
  if (screenshotPaths.length === 0) infrastructureErrors.push("Playwright did not produce a screenshot artifact.");
  if (!artifactPaths.some((path) => path.endsWith("trace.zip"))) {
    infrastructureErrors.push("Playwright did not produce a trace artifact.");
  }
  if (!artifactPaths.some((path) => path.endsWith(".webm"))) {
    infrastructureErrors.push("Playwright did not produce a video artifact.");
  }
  const hasTimeout = tests.some((result) => result.status === "timedOut");
  const executionStatus = infrastructureErrors.length > 0
    ? "infrastructure_error"
    : hasTimeout
      ? "timed_out"
      : "completed";
  const resultPath = join(outputDir, "suite-result.json");
  const reportPath = join(outputDir, "acceptance-summary.html");
  const suite: SuiteResult = {
    executionStatus,
    processExitCode: processResult?.exitCode ?? null,
    tests,
    expectedTestIds: EXPECTED_IDS,
    skippedCount,
    infrastructureErrors: unique(infrastructureErrors),
    elapsedMs: Date.now() - startedAt,
    reportPath,
    resultPath,
    screenshotPaths,
    artifactPaths: unique([...artifactPaths, reportPath, resultPath]),
  };

  await writeFile(reportPath, await renderSelfContainedReport(suite), "utf8");
  artifactPaths = await listFiles(outputDir);
  suite.artifactPaths = artifactPaths;
  suite.screenshotPaths = artifactPaths.filter((path) => /\.(png|jpe?g)$/i.test(path));
  await writeFile(resultPath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
  return suite;
}

function validateScenario(scenario: Scenario): string[] {
  const errors: string[] = [];
  if (scenario.delayMs !== 200 && scenario.delayMs !== 800 && scenario.delayMs !== 1500) {
    errors.push("Scenario delayMs must be one of 200, 800, or 1500.");
  }
  if (scenario.repeatCount !== 2 && scenario.repeatCount !== 3) {
    errors.push("Scenario repeatCount must be 2 or 3.");
  }
  return errors;
}

async function validateWorkspace(workspace: string, errors: string[]): Promise<void> {
  for (const path of [join(workspace, "target", "checkout.ts"), join(workspace, "target", "types.ts")]) {
    try {
      const details = await stat(path);
      if (!details.isFile()) errors.push(`Workspace path is not a file: ${path}`);
    } catch {
      errors.push(`Workspace is missing required file: ${path}`);
    }
  }
}

async function readPackageVersion(path: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(path, "utf8")) as { dependencies?: Record<string, string> }).dependencies?.["@playwright/test"];
  } catch {
    return undefined;
  }
}

async function runPlaywright(
  root: string,
  workspace: string,
  outputDir: string,
  scenario: Scenario,
  onProgress: ((event: TestProgress) => void) | undefined,
): Promise<ProcessResult> {
  const executable = join(root, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  const bunExecutable = process.env.BUN_EXECUTABLE_PATH ?? process.execPath;
  return runProcess(executable, ["test", "--config", join(root, "playwright.acceptance.config.ts")], {
    ...process.env,
    KIOSKPROOF_WORKSPACE: workspace,
    KIOSKPROOF_OUTPUT_DIR: outputDir,
    KIOSKPROOF_SCENARIO: JSON.stringify(scenario),
    KIOSKPROOF_BUN_EXECUTABLE_PATH: bunExecutable,
  }, root, onProgress ? progressListener(onProgress) : undefined);
}

function runProcess(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  onStdout?: (chunk: string) => void,
): Promise<ProcessResult> {
  return new Promise((resolveProcess) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let spawnError: string | undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => { spawnError = `Unable to start Playwright: ${error.message}`; });
    child.on("close", (exitCode, signal) => {
      resolveProcess({ exitCode, signal, stdout, stderr, error: spawnError });
    });
  });
}

function progressListener(onProgress: (event: TestProgress) => void): (chunk: string) => void {
  let pending = "";
  let discarded = false;
  return (chunk) => {
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline === -1) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (!discarded) {
        const event = parseProgressEvent(line);
        if (event) onProgress(event);
      }
      discarded = false;
    }
    if (Buffer.byteLength(pending, "utf8") > MAX_PROGRESS_EVENT_BYTES) {
      pending = "";
      discarded = true;
    }
  };
}

export function parseProgressEvent(line: string): TestProgress | undefined {
  if (Buffer.byteLength(line, "utf8") > MAX_PROGRESS_EVENT_BYTES) return undefined;
  let event: Record<string, unknown>;
  try {
    event = asRecord(JSON.parse(line));
  } catch {
    return undefined;
  }
  const kind = stringValue(event.kind);
  const id = stringValue(event.id);
  const title = stringValue(event.title);
  const status = progressStatus(event.status);
  const timestamp = stringValue(event.timestamp);
  if (
    kind !== PROGRESS_EVENT_KIND
    || !id
    || !EXPECTED_IDS.includes(id as (typeof EXPECTED_IDS)[number])
    || !title
    || Buffer.byteLength(title, "utf8") > MAX_PROGRESS_TITLE_BYTES
    || !title.startsWith(`${id} `)
    || !status
    || !timestamp
    || !isIsoTimestamp(timestamp)
  ) return undefined;

  const durationMs = numberValue(event.durationMs);
  const error = stringValue(event.error);
  if (error !== undefined && Buffer.byteLength(error, "utf8") > MAX_PROGRESS_ERROR_BYTES) return undefined;
  if (status === "running") {
    return durationMs === undefined && error === undefined ? { id, title, status, timestamp } : undefined;
  }
  return durationMs !== undefined && durationMs >= 0
    ? { id, title, status, timestamp, durationMs, ...(error === undefined ? {} : { error }) }
    : undefined;
}

async function parseReporter(
  reporterPath: string,
  outputDir: string,
  errors: string[],
): Promise<{ tests: TestResult[] }> {
  let reporter: Record<string, unknown>;
  try {
    reporter = asRecord(JSON.parse(await readFile(reporterPath, "utf8")));
  } catch (error) {
    errors.push(`Playwright JSON reporter is missing or unreadable: ${errorMessage(error)}`);
    return { tests: [] };
  }
  for (const error of asArray(reporter.errors)) errors.push(`Playwright reporter error: ${formatReporterError(error)}`);
  const tests: TestResult[] = [];
  for (const suite of asArray(reporter.suites)) await flattenSuite(asRecord(suite), outputDir, tests);
  return { tests };
}

async function flattenSuite(suite: Record<string, unknown>, outputDir: string, tests: TestResult[]): Promise<void> {
  for (const specValue of asArray(suite.specs)) {
    const spec = asRecord(specValue);
    const title = stringValue(spec.title) ?? "Unnamed acceptance test";
    const id = /^AT-\d{2}\b/.exec(title)?.[0] ?? title;
    const rawTests = asArray(spec.tests);
    if (rawTests.length !== 1) {
      tests.push({
        id,
        title,
        status: "interrupted",
        durationMs: 0,
        error: "Reporter did not provide exactly one result for this acceptance specification.",
        attachments: [],
      });
      continue;
    }
    const rawTest = asRecord(rawTests[0]);
    const results = asArray(rawTest.results);
    const final = asRecord(results.at(-1));
    const attachments = asArray(final.attachments).map(asRecord).map((attachment) => attachmentFrom(attachment, outputDir));
    const result: TestResult = {
      id,
      title,
      status: statusValue(final.status),
      durationMs: numberValue(final.duration) ?? 0,
      error: reporterErrorMessage(final),
      attachments: attachments.map((attachment) => attachment.path ?? attachment.name),
    };
    const orderAttachment = attachments.find((attachment) => attachment.name === "order-observation");
    const paymentAttachment = attachments.find((attachment) => attachment.name === "payment-observation");
    const requestsAttachment = attachments.find((attachment) => attachment.name === "request-events");
    result.orderObservation = await readObservation(orderAttachment?.path);
    result.paymentObservation = await readObservation(paymentAttachment?.path);
    result.requests = await readRecords(requestsAttachment?.path);
    tests.push(result);
  }
  for (const child of asArray(suite.suites)) await flattenSuite(asRecord(child), outputDir, tests);
}

function attachmentFrom(attachment: Record<string, unknown>, outputDir: string): Attachment {
  const rawPath = stringValue(attachment.path);
  return {
    name: stringValue(attachment.name) ?? "unnamed attachment",
    path: rawPath ? (isAbsolute(rawPath) ? rawPath : resolve(outputDir, rawPath)) : undefined,
    body: stringValue(attachment.body),
  };
}

async function readObservation(path: string | undefined): Promise<StateObservation | undefined> {
  const value = await readJsonPath(path);
  if (!isRecord(value) || typeof value.source !== "string" || !Array.isArray(value.records)) return undefined;
  return { source: value.source, records: value.records.filter(isRecord) };
}

async function readRecords(path: string | undefined): Promise<Record<string, unknown>[] | undefined> {
  const value = await readJsonPath(path);
  return Array.isArray(value) ? value.filter(isRecord) : undefined;
}

async function readJsonPath(path: string | undefined): Promise<Record<string, unknown> | unknown[] | undefined> {
  if (!path) return undefined;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(value) || Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function validateExpectedResults(tests: TestResult[], errors: string[]): void {
  const ids = tests.map((test) => test.id);
  for (const id of EXPECTED_IDS) {
    if (ids.filter((actual) => actual === id).length !== 1) errors.push(`Expected acceptance result ${id} was missing or duplicated.`);
  }
  for (const id of ids) {
    if (!EXPECTED_IDS.includes(id as (typeof EXPECTED_IDS)[number])) errors.push(`Unexpected acceptance result ${id}.`);
  }
  if (tests.length !== EXPECTED_IDS.length) {
    errors.push(`Expected ${EXPECTED_IDS.length} acceptance results but received ${tests.length}.`);
  }
}

function validateEvidence(tests: TestResult[], errors: string[]): void {
  for (const id of OBSERVED_TEST_IDS) {
    const test = tests.find((candidate) => candidate.id === id);
    if (!test?.orderObservation || !test.paymentObservation || !test.requests) {
      errors.push(`${id} is missing trusted order, payment, or request-event evidence.`);
    }
  }
}

function validateFailures(tests: TestResult[], errors: string[]): void {
  for (const test of tests) {
    if (test.status === "interrupted") errors.push(`${test.id} was interrupted.`);
    if (test.status === "failed" && !isAssertionFailure(test.error)) {
      errors.push(`${test.id} failed outside an assertion: ${test.error ?? "no error details"}`);
    }
    if (isBrowserCrash(test.error)) errors.push(`${test.id} had a browser or target-process crash: ${test.error}`);
  }
}

function isAssertionFailure(error: string | undefined): boolean {
  return Boolean(error && /expect\(|expect\(received\)|AssertionError|toHaveLength|toEqual|toMatch/.test(error));
}

function isBrowserCrash(error: string | undefined): boolean {
  return Boolean(error && /(browser.*(?:closed|crash)|target page.*closed|executable.*(?:missing|doesn't exist)|target server exited|ECONNREFUSED)/i.test(error));
}

async function hashFiles(paths: string[], errors: string[]): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const path of paths) {
    try {
      hashes.set(path, createHash("sha256").update(await readFile(path)).digest("hex"));
    } catch (error) {
      errors.push(`Cannot read protected verification input ${path}: ${errorMessage(error)}`);
    }
  }
  return hashes;
}

async function readProtectedSources(paths: string[], errors: string[]): Promise<string> {
  const sources: string[] = [];
  for (const path of paths) {
    try {
      sources.push(await readFile(path, "utf8"));
    } catch (error) {
      errors.push(`Cannot scan protected verification input ${path}: ${errorMessage(error)}`);
    }
  }
  return sources.join("\n");
}

async function listFiles(path: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) paths.push(...await listFiles(entryPath));
    else if (entry.isFile()) paths.push(entryPath);
  }
  return paths.sort();
}

async function renderSelfContainedReport(suite: SuiteResult): Promise<string> {
  const images = await Promise.all(suite.screenshotPaths.map(async (path) => {
    try {
      const extension = extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
      return `<figure><figcaption>${escapeHtml(path)}</figcaption><img src="data:${extension};base64,${(await readFile(path)).toString("base64")}" alt="Acceptance screenshot"></figure>`;
    } catch {
      return "";
    }
  }));
  const payload = JSON.stringify({
    executionMode: "reviewed_fixed_target",
    limitation: "Controlled fixture verification; target subprocess restrictions are not hardened isolation.",
    suite,
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>KioskProof acceptance report</title><style>
body{font:15px/1.45 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#18212f}h1{margin-bottom:.2rem}.status{font-weight:700}.completed{color:#087443}.infrastructure_error,.timed_out{color:#b42318}pre{white-space:pre-wrap;background:#f4f6f8;padding:1rem;border-radius:.4rem}figure{margin:1rem 0}img{max-width:100%;border:1px solid #ccd}li{margin:.35rem 0}</style></head><body>
<h1>KioskProof acceptance report</h1><p><strong>Mode:</strong> reviewed fixed-target mode. This is not hardened isolation.</p>
<p class="status ${suite.executionStatus}">Execution: ${escapeHtml(suite.executionStatus)}</p>
<h2>Acceptance results</h2><ul>${suite.tests.map((test) => `<li><strong>${escapeHtml(test.id)}</strong> ${escapeHtml(test.status)} (${test.durationMs}ms)${test.error ? ` - ${escapeHtml(test.error)}` : ""}</li>`).join("")}</ul>
<h2>Infrastructure findings</h2><pre>${escapeHtml(suite.infrastructureErrors.join("\n") || "None")}</pre>
<h2>Screenshots</h2>${images.join("") || "<p>No screenshots were produced.</p>"}
<script type="application/json" id="suite-result">${payload}</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function formatProcessResult(result: ProcessResult): string {
  return [
    "Command: playwright test --config playwright.acceptance.config.ts",
    `Exit code: ${String(result.exitCode)}`,
    `Signal: ${String(result.signal)}`,
    result.stdout,
    result.stderr,
  ].filter(Boolean).join("\n");
}

function reporterErrorMessage(result: Record<string, unknown>): string | undefined {
  const errors = asArray(result.errors).map(formatReporterError).filter(Boolean);
  const error = stringValue(asRecord(result.error).message);
  return [...errors, error].filter(Boolean).join("\n") || undefined;
}

function formatReporterError(value: unknown): string {
  const record = asRecord(value);
  return stringValue(record.message) ?? JSON.stringify(record);
}

function statusValue(value: unknown): TestResult["status"] {
  switch (value) {
    case "passed": return "passed";
    case "failed": return "failed";
    case "skipped": return "skipped";
    case "timedOut": return "timedOut";
    default: return "interrupted";
  }
}

function progressStatus(value: unknown): TestProgress["status"] | undefined {
  switch (value) {
    case "running":
    case "passed":
    case "failed":
    case "skipped":
    case "timedOut":
    case "interrupted":
      return value;
    default:
      return undefined;
  }
}

function isIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
