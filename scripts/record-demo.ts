import { chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Run, RunPhase } from "../src/types";

const base = (process.env.KIOSKPROOF_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const directory = join(".kioskproof/demo", new Date().toISOString().replace(/[:.]/g, "-"));
const recordingArtifacts = {
  overviewContract: join(directory, "overview-contract.png"),
  overviewBaseline: join(directory, "overview-baseline.png"),
  patchReview: join(directory, "patch-review.png"),
  overviewVerified: join(directory, "overview-verified.png"),
  evidence: join(directory, "evidence.png"),
  recordedRun: join(directory, "recorded-run.json"),
  evidenceIndex: join(directory, "evidence-artifacts.json"),
  video: join(directory, "kioskproof-demo.webm"),
};
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: directory, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const video = page.video()!;
const proofAbort = new AbortController();

// This records the real UI. The only instrumentation identifies automated QA
// honestly and labels its approval requests, without changing the application.
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = "RECORDED QA DEMONSTRATION / Google Antigravity + Gemini 4 Argon / Operator actions simulated";
    document.querySelector(".content")?.prepend(notice);
  }, { once: true });
});
await page.route("**/api/runs/*/approve-*", async (route) => {
  const request = route.request();
  await route.continue({
    postData: JSON.stringify({ ...request.postDataJSON(), reviewer: "qa_driver" }),
  });
});

function phase(page: Page, expected: RunPhase): Promise<string> {
  return page.evaluate(({ expected }) => new Promise<string>((resolve, reject) => {
    const panel = document.querySelector("#run-panel");
    if (!panel) { reject(new Error("Run panel not found.")); return; }
    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => check(true));
    const finish = (error?: Error, runId?: string) => {
      observer.disconnect();
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(runId!);
    };
    const check = (changed: boolean) => {
      const run = panel.querySelector<HTMLElement>("[data-run-phase]");
      const actionError = document.querySelector<HTMLElement>("#action-error");
      if (run?.dataset.runPhase === expected) finish(undefined, run.dataset.runId);
      else if (changed && actionError && !actionError.hidden) finish(new Error(actionError.textContent ?? "The UI action failed."));
      else if (changed && ["failed", "needs_review"].includes(run?.dataset.runPhase ?? "")) {
        finish(new Error(`Run stopped in ${run!.dataset.runPhase}.`));
      }
    };
    timer = setTimeout(() => finish(new Error(`Timed out awaiting ${expected}.`)), 240000);
    observer.observe(panel.parentElement ?? panel, { childList: true, subtree: true, attributes: true });
    check(false);
  }), { expected });
}

async function selectTab(page: Page, tab: "overview" | "patch" | "evidence"): Promise<void> {
  await page.locator(`#tab-${tab}`).click();
  await page.locator(`#tab-${tab}[aria-selected="true"]`).waitFor({ state: "visible", timeout: 240000 });
  await page.locator(`#panel-${tab}`).waitFor({ state: "visible", timeout: 240000 });
}

async function expandWorkflowJob(page: Page, job: "contract" | "reproduce" | "repair" | "verify", status: "waiting" | "passed"): Promise<void> {
  const selector = `details.workflow-job[data-detail-id="${job}"].job-${status}`;
  const details = page.locator(selector);
  await details.waitFor({ state: "visible", timeout: 240000 });
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await details.locator("summary").click();
  }
  await page.locator(`${selector}[open]`).waitFor({ state: "visible", timeout: 240000 });
}

async function visiblePatchLink(page: Page): Promise<string> {
  const patch = page.locator("#panel-patch").getByRole("link", { name: "Download diff" });
  await patch.waitFor({ state: "visible", timeout: 240000 });
  const patchPath = await patch.getAttribute("href");
  if (!patchPath) throw new Error("The Patch tab did not expose its diff path.");
  return new URL(patchPath, base).href;
}

async function visibleEvidenceLinks(page: Page): Promise<{ report: string; manifest: string }> {
  const evidence = page.locator("#panel-evidence");
  const report = evidence.getByRole("link", { name: "Markdown report" });
  const manifest = evidence.getByRole("link", { name: "Result manifest" });
  await Promise.all([
    report.waitFor({ state: "visible", timeout: 240000 }),
    manifest.waitFor({ state: "visible", timeout: 240000 }),
  ]);
  const [reportPath, manifestPath] = await Promise.all([report.getAttribute("href"), manifest.getAttribute("href")]);
  if (!reportPath || !manifestPath) throw new Error("The Evidence tab did not expose its report and manifest paths.");
  return { report: new URL(reportPath, base).href, manifest: new URL(manifestPath, base).href };
}

let runId: string | undefined;
const started = performance.now();
try {
  await page.goto(base, { waitUntil: "load" });
  await page.locator("#delay").selectOption("800");
  await page.locator("#repeats").selectOption("2");
  const contract = phase(page, "awaiting_contract_approval");
  await page.locator("#run-form button[type=submit]").click();
  await page.locator("#run-panel").scrollIntoViewIfNeeded();
  runId = await contract;
  await selectTab(page, "overview");
  await expandWorkflowJob(page, "contract", "waiting");
  console.log(`DEMO_PHASE ${runId} contract_review`);
  await page.screenshot({ path: recordingArtifacts.overviewContract, fullPage: true });

  const baseline = phase(page, "baseline_ready");
  await page.locator('[data-action="approve-contract"][data-decision="approved"]').click();
  await baseline;
  await selectTab(page, "overview");
  await expandWorkflowJob(page, "reproduce", "passed");
  await page.locator("#panel-overview .comparison").scrollIntoViewIfNeeded();
  await page.screenshot({ path: recordingArtifacts.overviewBaseline, fullPage: true });
  console.log(`DEMO_PHASE ${runId} baseline_reproduced`);

  const proposal = phase(page, "awaiting_patch_approval");
  await page.locator('[data-action="repair"]').click();
  await proposal;
  await selectTab(page, "patch");
  await expandWorkflowJob(page, "repair", "waiting");
  await page.locator("#panel-patch .repair-card").scrollIntoViewIfNeeded();
  await page.locator("#panel-patch .diff").waitFor({ state: "visible", timeout: 240000 });
  const patchArtifact = await visiblePatchLink(page);
  await page.screenshot({ path: recordingArtifacts.patchReview, fullPage: true });
  console.log(`DEMO_PHASE ${runId} argon_patch_review`);

  // Subscribe before approval. The final SSE event is emitted only after the
  // server's durable export finishes, unlike an intermediate HTTP status poll.
  const events = await fetch(`${base}/api/runs/${runId}/events`, {
    signal: AbortSignal.any([proofAbort.signal, AbortSignal.timeout(240000)]),
  });
  if (!events.ok || !events.body) throw new Error("The run event stream is unavailable.");
  const reader = events.body.getReader();
  const durable = (async (): Promise<Run> => {
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const item = await reader.read();
      if (item.done) throw new Error("The proof stream closed before export completed.");
      buffer += decoder.decode(item.value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event.split("\n").find((line) => line.startsWith("data: "));
        if (!data) continue;
        const updated = JSON.parse(data.slice(6)) as Run;
        if (updated.phase === "failed") throw new Error(updated.error ?? "Recorded verification failed.");
        if (updated.phase === "complete") return updated;
      }
    }
  })();
  void durable.catch(() => {}); // The original promise is awaited below; cleanup can also abort it.
  const complete = phase(page, "complete");
  await page.locator('[data-action="approve-patch"][data-decision="approved"]').click();
  await complete;
  await selectTab(page, "overview");
  await expandWorkflowJob(page, "verify", "passed");
  await page.locator("#panel-overview .comparison").scrollIntoViewIfNeeded();
  await page.screenshot({ path: recordingArtifacts.overviewVerified, fullPage: true });
  const run = await durable;
  if (run.verdict !== "VERIFIED_IN_SCOPE" || run.storage.error) throw new Error("The recorded run or durable export was not verified.");
  await writeFile(recordingArtifacts.recordedRun, JSON.stringify(run, null, 2) + "\n");

  await selectTab(page, "evidence");
  const evidenceLinks = await visibleEvidenceLinks(page);
  await page.screenshot({ path: recordingArtifacts.evidence, fullPage: true });
  const runArtifacts = {
    report: evidenceLinks.report,
    manifest: evidenceLinks.manifest,
    patch: patchArtifact,
    evidence: run.evidence.map((item) => ({
      evidenceId: item.evidenceId,
      type: item.type,
      relativeArtifactPath: item.relativeArtifactPath,
      url: `${base}/artifacts/${run.id}/${item.relativeArtifactPath.split("/").map(encodeURIComponent).join("/")}`,
    })),
  };
  await writeFile(recordingArtifacts.evidenceIndex, JSON.stringify(runArtifacts, null, 2) + "\n");
  console.log("DEMO_RESULT " + JSON.stringify({
    runId, verdict: run.verdict, elapsedMs: Math.round(performance.now() - started),
    source: base, model: run.attempts.at(-1)?.model, directory,
    approvalMode: "qa_driver", recording: "genuine browser recording, not live playback",
    artifacts: recordingArtifacts, evidenceCount: runArtifacts.evidence.length,
  }));
} finally {
  proofAbort.abort();
  await context.close();
  await video.saveAs(recordingArtifacts.video);
  await browser.close();
  console.log(`DEMO_VIDEO ${recordingArtifacts.video}`);
}
