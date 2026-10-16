import { createInterface } from "node:readline/promises";
import { DEFAULT_POLICY, SCENARIO_ID, TARGET_ID, type Run, type RunPhase, type Scenario } from "../src/types";

const base = process.env.KIOSKPROOF_URL ?? "http://127.0.0.1:8080";
const automated = process.argv.includes("--qa");
const one = process.argv.includes("--one");
const scenarios: Scenario[] = one
  ? [{ delayMs: 800, repeatCount: 2 }]
  : [{ delayMs: 200, repeatCount: 2 }, { delayMs: 800, repeatCount: 3 }, { delayMs: 1500, repeatCount: 2 }];

async function api(path: string, body?: unknown): Promise<Run> {
  const response = await fetch(base + path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json() as { run: Run; error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data.run;
}

// A replayable SSE subscription, not a timing-dependent poll loop.
async function subscribe(id: string) {
  const abort = new AbortController();
  const response = await fetch(`${base}/api/runs/${id}/events`, { signal: abort.signal });
  if (!response.ok || !response.body) throw new Error(`Run event stream returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  let latest: Run | undefined;
  let pending: { phases: RunPhase[]; resolve: (run: Run) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  let buffer = "";
  let failure: Error | undefined;
  const decoder = new TextDecoder();
  const deliver = (run: Run) => {
    latest = run;
    console.log(`PHASE ${run.id.slice(0, 8)} ${run.phase}`);
    if (pending && (pending.phases.includes(run.phase) || ["failed", "needs_review"].includes(run.phase))) {
      const current = pending;
      pending = undefined;
      clearTimeout(current.timer);
      current.resolve(run);
    }
  };
  const task = (async () => {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) throw new Error("Run event stream closed before rehearsal completion.");
        buffer += decoder.decode(result.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = event.split("\n").find((part) => part.startsWith("data: "));
          if (line) deliver(JSON.parse(line.slice(6)) as Run);
        }
      }
    } catch (error) {
      if (abort.signal.aborted) return;
      failure = error instanceof Error ? error : new Error("Event stream failed.");
      if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = undefined; }
    }
  })();
  return {
    until(phases: RunPhase[], timeout = 210000): Promise<Run> {
      if (failure) return Promise.reject(failure);
      if (latest && (phases.includes(latest.phase) || ["failed", "needs_review"].includes(latest.phase))) return Promise.resolve(latest);
      if (pending) throw new Error("Only one phase subscription is supported.");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending = undefined; reject(new Error(`Timed out awaiting ${phases.join("/")}.`)); }, timeout);
        pending = { phases, resolve, reject, timer };
      });
    },
    async close() { abort.abort(); await reader.cancel().catch(() => {}); await task; },
  };
}

async function approve(question: string): Promise<void> {
  if (automated) return;
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if ((await terminal.question(`${question} Type APPROVE to continue: `)).trim() !== "APPROVE") throw new Error("Operator did not approve.");
  } finally { terminal.close(); }
}

if (automated) console.log("QA_SIMULATION: approval gates are exercised by the QA driver, not represented as human review.");
const summaries = [];
for (const scenario of scenarios) {
  console.log(`REHEARSAL_INPUT ${JSON.stringify(scenario)}`);
  let run = await api("/api/runs", { targetId: TARGET_ID, scenarioId: SCENARIO_ID, policyText: DEFAULT_POLICY, scenarioParameters: scenario });
  const stream = await subscribe(run.id);
  try {
    run = await stream.until(["awaiting_contract_approval"]);
    if (run.phase !== "awaiting_contract_approval") throw new Error(run.error ?? `Contract stopped in ${run.phase}.`);
    console.log("CONTRACT", JSON.stringify(run.contract, null, 2));
    await approve("Review the contract and fixed oracle.");
    const baselineReady = stream.until(["baseline_ready"]);
    await api(`/api/runs/${run.id}/approve-contract`, { decision: "approved", contractHash: run.contractHash, reviewer: automated ? "qa_driver" : "operator" });
    run = await baselineReady;
    if (run.phase !== "baseline_ready") throw new Error(run.error ?? `Baseline ${run.baselineStatus}.`);
    const patchReady = stream.until(["awaiting_patch_approval"]);
    await api(`/api/runs/${run.id}/repair`, {});
    run = await patchReady;
    if (run.phase !== "awaiting_patch_approval") throw new Error(run.error ?? run.attempts.at(-1)?.rejectionReason ?? `Repair stopped in ${run.phase}.`);
    console.log("ARGON_DIFF\n" + run.attempts.at(-1)!.proposal!.diff);
    await approve("Review the actual application-only diff.");
    const finished = stream.until(["complete"]);
    await api(`/api/runs/${run.id}/approve-patch`, { decision: "approved", patchHash: run.attempts.at(-1)!.patchHash, reviewer: automated ? "qa_driver" : "operator" });
    run = await finished;
    const summary = { runId: run.id, verdict: run.verdict, scenario, durations: run.durations, model: run.attempts.at(-1)?.model, report: `${base}/artifacts/${run.id}/report.md` };
    summaries.push(summary);
    console.log("REHEARSAL_RESULT " + JSON.stringify(summary));
    if (run.verdict !== "VERIFIED_IN_SCOPE") throw new Error(run.error ?? `Verification ${run.verificationStatus}.`);
  } finally { await stream.close(); }
}
console.log("REHEARSAL_COMPLETE " + JSON.stringify(summaries));
