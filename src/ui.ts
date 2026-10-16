import { DEFAULT_POLICY, TEST_IDS, type ModelMeta, type Run, type SuiteResult } from "./types";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function artifact(run: Run, path: string): string {
  return `/artifacts/${run.id}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function badge(text: string, tone = "neutral"): string {
  return `<span class="badge ${tone}">${escapeHtml(text.replaceAll("_", " "))}</span>`;
}

function receipt(meta?: ModelMeta): string {
  if (!meta) return `<p class="muted">An execution receipt appears after the actual Antigravity call.</p>`;
  const total = meta.usage?.total_tokens ?? meta.usage?.total_token_count ?? meta.usage?.totalTokenCount;
  return `<div class="receipt"><span class="spark" aria-hidden="true">+</span><div><strong>${escapeHtml(meta.modelId)}</strong>
    <span>${escapeHtml(meta.runtime)} / SDK ${escapeHtml(meta.sdkVersion)}</span></div>
    <div class="receipt-time">${(meta.elapsedMs / 1000).toFixed(1)}s${total !== undefined ? `<small>${total.toLocaleString()} tokens</small>` : ""}</div></div>
    ${meta.conversationId ? `<p class="micro wrap">Conversation ${escapeHtml(meta.conversationId)}</p>` : ""}`;
}

function table(suite?: SuiteResult): string {
  return `<div class="table-scroll"><table><thead><tr><th>Protected case</th><th>Orders</th><th>Charges</th><th>Result</th></tr></thead><tbody>
  ${TEST_IDS.map((id) => {
    const test = suite?.tests.find((result) => result.id === id);
    const names: Record<string, string> = { "AT-01": "Ordinary checkout", "AT-02": "Repeated UI action", "AT-03": "Direct duplicate delivery", "AT-05": "A legitimate second purchase", "AT-06": "Verification integrity" };
    return `<tr><td><code>${id}</code><span>${names[id]}</span></td><td>${test?.orderObservation?.records.length ?? "-"}</td><td>${test?.paymentObservation?.records.length ?? "-"}</td><td>${badge(test?.status ?? "not_run", test?.status === "passed" ? "positive" : test?.status === "failed" ? "negative" : "neutral")}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function links(run: Run, suite?: SuiteResult): string {
  if (!suite) return "";
  return `<div class="artifact-links">${suite.reportPath ? `<a href="${artifact(run, suite.reportPath)}" target="_blank" rel="noopener">Playwright report <span aria-hidden="true">&#8599;</span></a>` : ""}
  ${suite.resultPath ? `<a href="${artifact(run, suite.resultPath)}" target="_blank" rel="noopener">Raw results</a>` : ""}
  ${run.evidence.filter((e) => (e.type === "trace" || e.type === "video") && suite.artifactPaths.includes(e.relativeArtifactPath)).slice(0, 2).map((e) =>
    `<a href="${artifact(run, e.relativeArtifactPath)}" download>${escapeHtml(e.type)}</a>`).join("")}</div>`;
}

export function renderRun(run: Run): string {
  const attempt = run.attempts.at(-1);
  const before = run.baseline?.tests.find((test) => test.id === "AT-02");
  const screenshot = run.baseline?.screenshotPaths.find((path) => /AT-02|repeated|duplicate/i.test(path)) ?? run.baseline?.screenshotPaths[0];
  const stages = [
    ["Contract", ["preparing", "awaiting_contract_approval", "needs_review"]],
    ["Reproduce", ["reproducing", "baseline_ready"]],
    ["Argon repair", ["analyzing", "awaiting_patch_approval", "patching"]],
    ["Verify", ["verifying", "complete", "failed"]],
  ] as const;
  const phase = run.phase.replaceAll("_", " ");
  const terminal = ["complete", "failed", "needs_review"].includes(run.phase);
  const elapsed = ((Date.parse(terminal ? run.updatedAt : new Date().toISOString()) - Date.parse(run.createdAt)) / 1000).toFixed(0);
  return `<div data-run-id="${run.id}" data-run-phase="${run.phase}" data-contract-hash="${escapeHtml(run.contractHash)}" data-patch-hash="${escapeHtml(attempt?.patchHash)}">
    <div class="run-heading"><div><span class="eyebrow">LIVE EVIDENCE WORKSPACE</span><h2>${run.verdict === "VERIFIED_IN_SCOPE" ? "The app changed. The contract did not." : "Every claim needs a receipt."}</h2></div>
      <div class="run-meta">${badge(run.verdict === "VERIFIED_IN_SCOPE" ? "VERIFIED_IN_SCOPE" : phase, run.verdict === "VERIFIED_IN_SCOPE" ? "positive" : run.phase === "failed" ? "negative" : "blue")}<span class="micro">${elapsed}s elapsed / ${escapeHtml(run.id.slice(0, 8))}</span></div></div>
    <ol class="stepper">${stages.map(([name, phases], index) => `<li class="${(phases as readonly string[]).includes(run.phase) ? "current" : ""}"><span>0${index + 1}</span>${name}</li>`).join("")}</ol>
    ${run.error ? `<div class="notice error" role="alert"><strong>Run stopped</strong><p>${escapeHtml(run.error)}</p></div>` : ""}
    ${run.storage.error ? `<div class="notice error"><strong>Cloud export incomplete</strong><p>${escapeHtml(run.storage.error)} Local evidence remains available.</p></div>` : ""}
    <section class="card contract-card"><div class="section-heading"><h3><span class="section-number">01</span> Policy contract</h3>${badge(run.approvedContractVersion ? "frozen v1" : "review required", run.approvedContractVersion ? "blue" : "neutral")}</div>
      ${run.contract ? `<p class="contract-rule">${escapeHtml(run.contract.expectedOutcome)}</p><p class="muted">${escapeHtml(run.contract.scope)}</p>
      <details><summary>Inspect Argon's proposed contract</summary><dl><dt>Preconditions</dt><dd>${run.contract.preconditions.map(escapeHtml).join("<br>")}</dd><dt>Actions</dt><dd>${run.contract.actions.map(escapeHtml).join("<br>")}</dd><dt>Evidence</dt><dd>${run.contract.evidenceSources.map(escapeHtml).join("<br>")}</dd></dl></details>
      <div class="hash-row"><span>CONTRACT SHA-256</span><code>${escapeHtml(run.contractHash)}</code></div>
      <p class="micro">Fixed oracle: one order + one charge per intent; USD 14.50; five seconds after provider release. AT-01 / 02 / 03 / 05 / 06.</p>
      ${run.phase === "awaiting_contract_approval" ? `<div class="approval"><p>Review this contract. Approval freezes the scenario, tests, fixture, and oracle before baseline execution.</p><div class="button-row"><button type="button" data-action="approve-contract" data-decision="approved" class="button primary">Approve &amp; reproduce</button><button type="button" data-action="approve-contract" data-decision="rejected" class="button secondary">Reject</button></div></div>` : ""}
      ${run.phase === "needs_review" ? `<div class="notice"><strong>Needs human review</strong><p>${escapeHtml(run.contract.reviewReason)}</p><p>Create a new run with an unambiguous duplicate-checkout policy.</p></div>` : ""}`
        : `<div class="working"><span class="status-dot"></span>Antigravity is interpreting the operating rule with Gemini 4 Argon.</div>`}
      ${receipt(run.contractModel)}
    </section>
    <div class="comparison">
      <section class="card"><div class="section-heading"><h3><span class="section-number">02</span> Before</h3>${badge(run.baselineStatus, run.baselineStatus === "reproduced" ? "negative" : "neutral")}</div>
        <p class="muted">The original application. Trusted observations, not a success toast.</p>
        ${run.baseline ? `<div class="count-grid"><div><span>ORDERS</span><strong class="${(before?.orderObservation?.records.length ?? 0) > 1 ? "red-text" : ""}">${before?.orderObservation?.records.length ?? "-"}</strong><small>Direct order-store read</small></div><div><span>SIMULATED CHARGES</span><strong class="${(before?.paymentObservation?.records.length ?? 0) > 1 ? "red-text" : ""}">${before?.paymentObservation?.records.length ?? "-"}</strong><small>Provider-owned ledger</small></div></div>
        ${screenshot ? `<a class="screenshot" href="${artifact(run, screenshot)}" target="_blank" rel="noopener"><img src="${artifact(run, screenshot)}" alt="Captured baseline synthetic checkout failure" loading="lazy"></a>` : ""}
        ${table(run.baseline)}${links(run, run.baseline)}`
          : `<div class="empty"><div class="empty-mark">01</div><h4>Reproduce before repairing.</h4><p>Approve the contract to run the real checkout and capture the duplicate-order violation.</p></div>`}
      </section>
      <section class="card"><div class="section-heading"><h3><span class="section-number">04</span> After</h3>${badge(run.verificationStatus, run.verdict === "VERIFIED_IN_SCOPE" ? "positive" : run.verificationStatus === "failed" ? "negative" : "neutral")}</div>
        <p class="muted">The same input. The same protected acceptance suite.</p>
        ${attempt?.suite ? `${table(attempt.suite)}<div class="integrity ${attempt.protectedHashesMatch ? "intact" : "broken"}"><strong>${attempt.protectedHashesMatch ? "Frozen inputs unchanged" : "Integrity check failed"}</strong><span>Contract + tests + configuration + fixtures</span></div>${links(run, attempt.suite)}`
          : `<div class="empty"><div class="empty-mark">=</div><h4>A green result is earned.</h4><p>All five protected cases must pass after an approved application-only patch. Missing results never count as success.</p></div>`}
        <p class="scope-note">Single-instance synthetic checkout. No real payments. AT-04 lost-response recovery is outside this claim.</p>
      </section>
    </div>
    <section class="card repair-card"><div class="section-heading"><h3><span class="section-number">03</span> Antigravity repair</h3><span class="agent-label"><span class="spark" aria-hidden="true">+</span> GEMINI 4 ARGON</span></div>
      ${attempt?.proposal ? `<div class="repair-grid"><div><h4>Evidence-linked diagnosis</h4><p>${escapeHtml(attempt.proposal.rationale)}</p>
      <h5>Observed</h5><ul>${attempt.proposal.observations.map((observation) => `<li>${escapeHtml(observation)}</li>`).join("")}</ul>
      ${attempt.proposal.hypotheses.length ? `<h5>Hypotheses, not verified facts</h5><ul>${attempt.proposal.hypotheses.map((hypothesis) => `<li>${escapeHtml(hypothesis)}</li>`).join("")}</ul>` : ""}
      <div class="evidence-chips">${attempt.proposal.evidenceIds.map((id) => {
        const item = run.evidence.find((e) => e.evidenceId === id);
        return item ? `<a href="${artifact(run, item.relativeArtifactPath)}" target="_blank" rel="noopener">${escapeHtml(id)}</a>` : `<span>${escapeHtml(id)}</span>`;
      }).join("")}</div>${receipt(attempt.model)}
      </div><div><div class="diff-title"><code>target/checkout.ts</code><a href="${artifact(run, `patch-${attempt.number}.diff`)}" download>Download diff</a></div>
      <pre class="diff" tabindex="0">${attempt.proposal.diff.split("\n").map((line) => `<span class="${line.startsWith("+") ? "addition" : line.startsWith("-") ? "deletion" : line.startsWith("@@") ? "hunk" : ""}">${escapeHtml(line)}\n</span>`).join("")}</pre></div></div>
      <div class="hash-row"><span>PATCH SHA-256</span><code>${escapeHtml(attempt.patchHash ?? "rejected before execution")}</code></div>
      ${attempt.rejectionReason ? `<div class="notice error">${escapeHtml(attempt.rejectionReason)}</div>` : ""}
      ${run.phase === "awaiting_patch_approval" ? `<div class="approval"><p>Only <code>target/checkout.ts</code> changes. Review the diff before compiling and executing the fixed synthetic target. This is a reviewed workspace, not a hardened sandbox.</p><div class="button-row"><button type="button" class="button primary" data-action="approve-patch" data-decision="approved">Approve patch &amp; verify</button><button type="button" class="button secondary" data-action="approve-patch" data-decision="rejected">Reject patch</button></div></div>` : ""}
      <p class="micro">Attempt ${attempt.number} / 2. Earlier attempts remain in the manifest and report.</p>`
        : `<p class="muted">Argon receives the policy, approved contract, real screenshots, timestamped requests, order and payment observations, and bounded application source. It proposes a patch; the trusted runner decides the result.</p>
        ${run.phase === "baseline_ready" ? `<button type="button" class="button primary" data-action="repair">Investigate &amp; propose with Argon <span aria-hidden="true">&#8594;</span></button>` : `<div class="empty-inline">Waiting for a reproduced baseline. No patch has been generated.</div>`}`}
      ${run.phase === "failed" && run.verificationStatus === "failed" && attempt?.suite?.executionStatus === "completed" && run.attempts.length < 2 ? `<button type="button" class="button secondary" data-action="repair">Request final Argon attempt</button>` : ""}
    </section>
    <section class="card export-card"><div><h3>Take the evidence with you.</h3><p class="muted">Actual inputs, model receipts, every attempt, protected hashes, and limitations.</p></div><div class="button-row"><a class="button secondary" href="${artifact(run, "report.md")}" download>Markdown report</a><a class="button secondary" href="${artifact(run, "manifest.json")}" download>Result manifest</a></div></section>
    <details class="card audit"><summary>Execution log &amp; verification dimensions</summary><div class="dimensions">${[
      ["Execution", run.executionStatus], ["Baseline", run.baselineStatus], ["Verification", run.verificationStatus], ["Human approval", run.humanApproval],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
      <ol class="event-log">${run.events.map((event) => `<li><time>${escapeHtml(event.timestamp.slice(11, 19))}</time><span>${escapeHtml(event.message)}</span></li>`).join("")}</ol>
      <h4>Verification scope</h4><ul>${run.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${run.protectedHash ? `<div class="hash-row"><span>PROTECTED SUITE SHA-256</span><code>${escapeHtml(run.protectedHash)}</code></div>` : ""}
      <p class="micro">Evidence: ${escapeHtml(run.storage.mode)}${run.storage.bucket ? ` / ${escapeHtml(run.storage.bucket)}` : ""}${run.storage.syncedAt ? ` / last export ${escapeHtml(run.storage.syncedAt)}` : ""}</p>
    </details>
  </div>`;
}

export function renderPage(
  run: Run | undefined,
  runs: Run[],
  config: { modelId: string; cloudProject: string; cloudRegion: string; storageMode: string; agentAvailable: boolean; deployed?: boolean },
): string {
  const blocked = run && !["complete", "failed", "needs_review"].includes(run.phase);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#111c2b"><title>KioskProof / Evidence-first repair</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%231a66ff'/%3E%3Cpath d='M11 9v22m0-10L27 9M11 21l16 10' stroke='white' stroke-width='4' fill='none'/%3E%3C/svg%3E"><link rel="stylesheet" href="/style.css"><script src="/client.js" defer></script></head>
  <body><aside class="rail"><a href="/" class="brand"><span class="brand-icon">K</span>KioskProof<span class="brand-period">.</span></a><p class="rail-caption">EVIDENCE-FIRST REPAIR</p>
    <nav aria-label="Workspace"><a class="nav-current" href="/">&#9635; <span>Repair workspace</span></a></nav>
    <div class="rail-history"><span class="eyebrow">RECENT RUNS</span>${runs.length ? runs.slice(0, 8).map((item) => `<a href="/?run=${item.id}" class="history-item ${item.id === run?.id ? "selected" : ""}"><span class="history-dot ${item.verdict === "VERIFIED_IN_SCOPE" ? "success" : item.phase === "failed" ? "failure" : ""}"></span><code>${item.id.slice(0, 8)}</code><small>${item.phase === "complete" ? "verified" : escapeHtml(item.phase.replaceAll("_", " "))}</small></a>`).join("") : `<p class="rail-empty">Your first run starts with an operating rule.</p>`}</div>
    <div class="rail-bottom"><span class="cloud-icon" aria-hidden="true">&#9729;</span><div><strong>${config.deployed ? "Google Cloud" : "Local preview"}</strong><span>${escapeHtml(config.cloudRegion)}</span></div><p>${escapeHtml(config.cloudProject || "Project not configured")}</p><small>Reviewed fixed-target mode</small></div></aside>
  <main><header class="topbar"><span>DEVELOPER TOOLS <span class="divider">/</span> CHECKOUT INTEGRITY</span><div class="runtime-pill"><span class="status-dot ${config.agentAvailable ? "" : "offline"}"></span>${config.agentAvailable ? "Agent runtime configured" : "Agent setup required"}</div></header>
  <div class="content"><section class="hero"><div class="eyebrow"><span class="blue-line"></span> GOOGLE DEEPMIND HACKATHON 2026</div><h1>Fix the app.<br><span>Keep the proof.</span></h1><p>A kiosk rule becomes a frozen regression.<br>Antigravity investigates. Argon proposes. Evidence decides.</p>
  <div class="hero-agent"><span class="spark" aria-hidden="true">+</span><div><strong>Google Antigravity</strong><span>POWERED BY ${escapeHtml(config.modelId.toUpperCase().replaceAll("-", " "))}</span></div><span class="agent-divider"></span><span class="micro">Multimodal diagnosis<br>Application-only repair</span></div></section>
  <section class="card intake"><div class="section-heading"><div><span class="eyebrow">START A REAL RUN</span><h2>What must never happen?</h2></div><span class="target-chip"><span class="status-dot"></span>synthetic-checkout</span></div>
  <form id="run-form"><label for="policy">Operating rule <span>POL-001</span></label><textarea id="policy" name="policyText" minlength="30" maxlength="4096" rows="4" required ${blocked ? "disabled" : ""}>${escapeHtml(run?.input.policyText ?? DEFAULT_POLICY)}</textarea>
  <div class="form-bottom"><div class="scenario-fields"><label for="delay">Provider delay<select id="delay" name="delayMs" ${blocked ? "disabled" : ""}>${[200, 800, 1500].map((delay) => `<option value="${delay}" ${delay === (run?.input.scenarioParameters.delayMs ?? 800) ? "selected" : ""}>${delay.toLocaleString()} ms</option>`).join("")}</select></label><label for="repeats">Repeated actions<select id="repeats" name="repeatCount" ${blocked ? "disabled" : ""}>${[2, 3].map((repeat) => `<option value="${repeat}" ${repeat === (run?.input.scenarioParameters.repeatCount ?? 2) ? "selected" : ""}>${repeat} actions</option>`).join("")}</select></label></div><button class="button primary" type="submit" ${blocked || !config.agentAvailable ? "disabled" : ""}>Create contract with Argon <span aria-hidden="true">&#8594;</span></button></div>
  <p class="micro">Fresh state. Synthetic data. Explicit human approval before baseline and patch execution. No arbitrary uploads or URLs.</p></form></section>
  <div id="action-error" class="notice error" role="alert" hidden></div>
  <div id="run-panel">${run ? renderRun(run) : `<section class="welcome"><div class="welcome-line"></div><span class="eyebrow">NO CLAIM WITHOUT A BASELINE</span><h2>One bug. A complete chain of evidence.</h2><div class="welcome-grid"><div><span>01</span><strong>Freeze the rule</strong><p>Review the contract and lock the acceptance suite.</p></div><div><span>02</span><strong>Make the failure real</strong><p>Observe duplicate orders and simulated charges.</p></div><div><span>03</span><strong>Repair with Argon</strong><p>Review a source diff linked to captured evidence.</p></div><div><span>04</span><strong>Prove the same scope</strong><p>Re-run the unchanged tests and export the receipts.</p></div></div></section>`}</div>
  <footer><span>KioskProof / Built by MoerAI</span><span>Google Antigravity + Gemini 4 Argon + Playwright</span></footer>
  </div></main></body></html>`;
}
