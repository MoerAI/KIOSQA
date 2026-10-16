import { readdir, readFile, stat, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { hash } from "./patch";
import type { Run } from "./types";

export async function listFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symbolic links are not supported in protected resources or evidence.");
    if (entry.isDirectory()) paths.push(...await listFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}

export function containedPath(directory: string, path: string): string {
  if (path.includes("\0") || path.includes("\\")) throw new Error("Invalid artifact path.");
  const root = resolve(directory);
  const result = resolve(root, path);
  if (!result.startsWith(root + sep)) throw new Error("Path is outside the artifact directory.");
  return result;
}

export async function readableArtifact(directory: string, path: string): Promise<boolean> {
  try {
    const absolute = containedPath(directory, path);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0) return false;
    if (!(await realpath(absolute)).startsWith((await realpath(directory)) + sep)) return false;
    await readFile(absolute);
    return true;
  } catch {
    return false;
  }
}

export async function protectedSnapshot(root: string): Promise<{ files: Record<string, string>; hash: string }> {
  const paths: string[] = [];
  for (const directory of ["src", "runner", "tests/acceptance", "target"]) {
    paths.push(...await listFiles(join(root, directory)));
  }
  for (const name of ["package.json", "bun.lock", "tsconfig.json", "playwright.acceptance.config.ts"]) {
    paths.push(join(root, name));
  }
  const files: Record<string, string> = {};
  for (const path of paths.sort()) {
    const name = relative(root, path).split(sep).join("/");
    if (name === "target/checkout.ts") continue;
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Protected source must not be a symbolic link.");
    files[name] = hash(await readFile(path));
  }
  return { files, hash: hash(JSON.stringify(files)) };
}

function report(run: Run): string {
  const model = run.attempts.at(-1)?.model ?? run.contractModel;
  const lines = [
    "# KioskProof evidence report",
    "",
    `**Verdict: ${run.verdict}**`,
    "",
    "Google Antigravity + Gemini 4 Argon. Empirical verification of one synthetic checkout, not a formal proof or a production payment certification.",
    "",
    `- Run: ${run.id}`,
    `- Created: ${run.createdAt}`,
    `- Source revision: ${run.baselineRevision}`,
    `- Execution: ${run.executionStatus}`,
    `- Baseline: ${run.baselineStatus}`,
    `- Verification: ${run.verificationStatus}`,
    `- Human approval: ${run.humanApproval}`,
    `- Mode: ${run.executionMode} (manually reviewed fixed target; not a hardened sandbox)`,
    `- Contract SHA-256: ${run.contractHash ?? "not approved"}`,
    `- Protected suite SHA-256: ${run.protectedHash ?? "not frozen"}`,
    `- Model: ${model?.modelId ?? "not called"}`,
    `- Agent runtime: ${model?.runtime ?? "not called"}`,
    `- SDK version: ${model?.sdkVersion ?? "not available"}`,
    `- API version: ${model?.apiVersion ?? "not exposed"}`,
    `- Scenario parameters: ${JSON.stringify(run.input.scenarioParameters)}`,
    `- Attempts: ${run.attempts.length}/2`,
    `- Evidence storage: ${run.storage.mode}${run.storage.bucket ? ` (${run.storage.bucket})` : ""}`,
    "",
    "## Original operating rule",
    "",
    run.input.policyText,
    "",
    "## Baseline and protected results",
    "",
    "| Case | Before | After |",
    "| --- | --- | --- |",
    ...["AT-01", "AT-02", "AT-03", "AT-05", "AT-06"].map((id) =>
      `| ${id} | ${run.baseline?.tests.find((t) => t.id === id)?.status ?? "not run"} | ${run.attempts.at(-1)?.suite?.tests.find((t) => t.id === id)?.status ?? "not run"} |`),
    "",
    "**AT-04 lost-response recovery is not implemented or claimed.**",
    "",
    "## Antigravity execution receipts",
    "",
    ...[run.contractModel, ...run.attempts.map((attempt) => attempt.model)].filter(Boolean).map((meta) =>
      `- ${meta!.modelId} via ${meta!.runtime} ${meta!.sdkVersion}; ${meta!.elapsedMs} ms; usage ${JSON.stringify(meta!.usage)}; conversation ${meta!.conversationId ?? "not exposed"}.`),
    "",
    "## Patch attempts (failures are retained)",
    "",
    ...run.attempts.flatMap((attempt) => [
      `### Attempt ${attempt.number}`,
      `- Patch: ${attempt.patchStatus}; approval: ${attempt.approval}; SHA-256: ${attempt.patchHash ?? "not generated"}`,
      `- Candidate revision: ${attempt.candidateRevision ?? "not applied"}`,
      `- Compile exit code: ${attempt.compile?.exitCode ?? "not run"}`,
      `- Protected resources unchanged: ${attempt.protectedHashesMatch ?? "not checked"}`,
      `- Duration: ${attempt.elapsedMs} ms`,
      attempt.rejectionReason ? `- Rejection: ${attempt.rejectionReason}` : "",
      attempt.proposal?.rationale ?? "",
      ...(attempt.proposal?.observations ?? []).map((fact) => `- Observed: ${fact}`),
      ...(attempt.proposal?.hypotheses ?? []).map((hypothesis) => `- Hypothesis: ${hypothesis}`),
      attempt.proposal ? `[Application diff](patch-${attempt.number}.diff)` : "",
      "",
    ]),
    "## Observations and evidence provenance",
    "",
    ...[run.baseline, ...run.attempts.map((attempt) => attempt.suite)].filter(Boolean).flatMap((suite) =>
      suite!.tests.map((test) =>
        `- ${test.id}: orders=${test.orderObservation?.records.length ?? "not observed"} from ${test.orderObservation?.source ?? "none"}; charges=${test.paymentObservation?.records.length ?? "not observed"} from ${test.paymentObservation?.source ?? "none"}.`)),
    "",
    ...run.evidence.map((e) => `- [${e.evidenceId}](${e.relativeArtifactPath}): ${e.type}, ${e.source}, SHA-256 ${e.contentHash}, ${e.timestamp}.`),
    "",
    "## Explicit approvals",
    "",
    ...run.approvals.map((approval) =>
      `- ${approval.timestamp}: ${approval.actor} ${approval.decision} ${approval.action}, SHA-256 ${approval.contentHash}.`),
    "",
    "## Phase durations",
    "",
    ...Object.entries(run.durations).map(([phase, milliseconds]) => `- ${phase}: ${milliseconds} ms`),
    "",
    "## Limitations",
    "",
    ...run.limitations.map((limitation) => `- ${limitation}`),
    ...(run.error ? [`- Run error: ${run.error}`] : []),
    ...(run.storage.error ? [`- Storage error: ${run.storage.error}`] : []),
    "",
  ];
  return lines.join("\n");
}

export async function writeExports(directory: string, run: Run): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "run.json"), JSON.stringify(run, null, 2) + "\n");
  await writeFile(join(directory, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    ...run,
    expectedTestIds: ["AT-01", "AT-02", "AT-03", "AT-05", "AT-06"],
    unimplementedTestIds: ["AT-04"],
    verificationRecord: {
      runId: run.id,
      candidateRevision: run.attempts.at(-1)?.candidateRevision ?? null,
      contractHash: run.contractHash ?? null,
      testManifestHash: run.protectedHash ?? null,
      expectedTestIds: ["AT-01", "AT-02", "AT-03", "AT-05", "AT-06"],
      results: run.attempts.at(-1)?.suite?.tests ?? [],
      skippedCount: run.attempts.at(-1)?.suite?.skippedCount ?? null,
      infrastructureErrors: run.attempts.at(-1)?.suite?.infrastructureErrors ?? [],
      orderObservation: run.attempts.at(-1)?.suite?.tests.map((test) => ({ testId: test.id, ...test.orderObservation })) ?? [],
      paymentObservation: run.attempts.at(-1)?.suite?.tests.map((test) => ({ testId: test.id, ...test.paymentObservation })) ?? [],
      elapsedMs: run.durations.total ?? null,
      verdict: run.verdict,
    },
  }, null, 2) + "\n");
  await writeFile(join(directory, "report.md"), report(run));
}

export class CloudEvidence {
  private uploaded = new Map<string, string>();
  constructor(readonly bucket = process.env.GCS_BUCKET ?? "") {
    if (bucket && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error("Invalid GCS bucket.");
  }

  private async token(): Promise<string> {
    const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Cloud service identity returned HTTP ${response.status}.`);
    const token = await response.json() as { access_token: string };
    return token.access_token;
  }

  async sync(directory: string, runId: string): Promise<void> {
    if (!this.bucket) return;
    const token = await this.token();
    for (const path of await listFiles(directory)) {
      const name = `runs/${runId}/${relative(directory, path).split(sep).join("/")}`;
      const body = await readFile(path);
      const checksum = hash(body);
      if (this.uploaded.get(name) === checksum) continue;
      const response = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body, signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error(`Evidence upload returned HTTP ${response.status}.`);
      this.uploaded.set(name, checksum);
    }
  }

  async restore(root: string): Promise<void> {
    if (!this.bucket) return;
    const token = await this.token();
    let pageToken = "";
    do {
      const list = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o?prefix=runs%2F${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
      });
      if (!list.ok) throw new Error(`Evidence listing returned HTTP ${list.status}.`);
      const body = await list.json() as { items?: { name: string; size: string }[]; nextPageToken?: string };
      for (const item of body.items ?? []) {
        if (Number(item.size) > 100_000_000) throw new Error("Stored evidence exceeds the supported file size.");
        const path = containedPath(root, item.name.replace(/^runs\//, ""));
        try { await stat(path); continue; } catch { /* Restore only absent local files. */ }
        const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(item.name)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`Evidence restore returned HTTP ${response.status}.`);
        await mkdir(resolve(path, ".."), { recursive: true });
        await writeFile(path, new Uint8Array(await response.arrayBuffer()));
      }
      pageToken = body.nextPageToken ?? "";
    } while (pageToken);
  }
}
