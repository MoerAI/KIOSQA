# KioskProof: Evidence-First Repair for Kiosk Workflows

**Product Requirements Document, v1.0**  
**Prepared:** 2026-10-14, Asia/Seoul  
**Target event:** Google DeepMind AI Hackathon, 2026-10-16  
**Track:** Open innovation: autonomous agents and developer tools  
**Status:** Pre-event design only. No KioskProof application, demonstration, or submission code has been implemented. All acceptance criteria below are targets, not measured product results.

## 1. Product decision

Build a narrowly scoped QA and repair harness that converts a kiosk operating rule and observed failure evidence into a reproducible regression, proposes an application patch, and proves the patch against a frozen acceptance suite.

**Core promise:** Fix the application, not the definition of success.

The hackathon MVP targets one synthetic web checkout kiosk and one bug family: duplicate orders caused by delayed responses and repeated submission. It does not claim to test every kiosk or make payment systems production-safe.

Use Playwright Test as the deterministic execution and evidence engine. Use the event-provided Gemini model as the investigator and patch proposer. Reuse the planner/generator separation illustrated by Playwright Test Agents, but do not use a test-healing agent to alter approved acceptance criteria. Stagehand and Magnitude are optional post-MVP discovery adapters, not required runtime dependencies.

## 2. User and problem

### Primary user
A developer responsible for web-based self-service kiosks at a small retail, printing, or service operator.

### Job to be done
“When an operator reports that a customer repeated an action and the system behaved incorrectly, help me reproduce the incident, identify the faulty code, and review a patch with evidence that the business rule now holds.”

### Current failure mode
An app can load successfully, return HTTP 200, and produce no console error while still violating an operating rule. A green smoke test or a model-generated explanation is therefore insufficient evidence of correctness.

### Founder advantage
The team can draw on practical kiosk/operations software experience and operating-policy evaluation concepts. Employer source code, customer data, internal manuals, proprietary research artifacts, and earlier projects must not be reused without both rights and event-rule clearance.

## 3. Goals and explicit non-goals

### P0 goals
1. Reproduce a duplicate-order violation in a fresh synthetic checkout application.
2. Link the failure to a policy clause, UI observation, request history, and application source.
3. Produce an actual application-source diff with Gemini.
4. Re-run the same frozen failing case plus normal-path regression cases.
5. Present independent state evidence, not just the app's success message.
6. Show a real-input demonstration in under 180 seconds, as a target to measure during rehearsal.
7. Serve the product from Google Cloud and export durable evidence before event resources are deleted.

### Non-goals
- Arbitrary repository uploads, arbitrary URLs, or arbitrary shell execution.
- Real payment gateways, real purchases, real refunds, or production data.
- Hardware/NPU validation, physical touchscreen reliability, or offline kiosk support.
- Autonomous production deployment, GitHub PR publishing, multi-tenant SaaS, accounts, and billing.
- Proving that a patch has no bugs outside the tested scope.
- Treating passing UI checks as proof of financial correctness.
- Depending on voice, video generation, multiple LLM agents, or a million-token prompt merely for spectacle.

## 4. Demonstration scenario and business contract

### Operating rule POL-001
For one purchase intent, concurrent duplicate delivery of an identical checkout request must create exactly one order and one simulated charge within five seconds after the controlled provider barrier is released. A new purchase intent must still be able to create a new order. Lost-response recovery is a separate P1 extension and is not covered by the P0 claim.

### Scope and definitions
- `purchaseIntentId`: stable identifier for one purchase attempt, reused across retries of that attempt.
- A deliberate new purchase uses a new intent identifier, even if the cart is identical.
- `idempotencyKey`: equal to the stable purchase intent ID for this demo, not regenerated on every click.
- The server binds a key to a canonical cart/amount payload. Concurrent identical requests share one in-flight result and return the same order ID; a completed duplicate returns that same result. An inconsistent payload using the same key is rejected with a conflict response and no additional side effect. This conflict rule needs its own test before being claimed as verified; it is outside the P0 demonstration coverage.
- Keys persist for the entire single-instance scenario and reset only between scenarios. Process-crash recovery, retention expiry, and distributed durability are not supported by the MVP.
- Mock-provider state and order-store state are separate observations.
- All values are synthetic. Amounts use integer minor units; no real money is moved.
- Browser contexts, order state, and mock-provider ledger reset for every scenario.
- Duplicate behavior is evaluated only inside the declared single-instance, event-demo scope. Distributed idempotency and crash recovery are explicitly future work.

### Baseline defect
The fresh target application processes duplicate submissions independently. A controlled delay makes overlap reproducible. The test runner coordinates request arrival with a barrier or recorded request count rather than relying exclusively on arbitrary sleeps.

### Essential demonstration sequence
1. Show the operating rule and a live repeated-submission action.
2. Show duplicate order/charge evidence from trusted observations.
3. Freeze the accepted regression contract and record its hash.
4. Ask Gemini to explain the violation and produce a patch.
5. Apply the patch only to the disposable target workspace under the applicable approval/sandbox policy.
6. Re-run the identical failing input and the protected regressions.
7. Show patch diff, before/after evidence, unchanged contract hash, and verification scope.

A screenshot and timestamped event log are P0 multimodal inputs. Arbitrary long-video ingestion is P1. Screen recordings generated by Playwright are useful evidence but are not a prerequisite for patch generation.

## 5. Functional requirements

### FR-01: Bounded input intake
Accept one allowlisted target repository created during the event, one policy text, and scenario parameters. Support screenshot plus captured logs. Reject external URLs, path traversal, unknown repositories, binaries, secrets, and unsupported file sizes. No user-supplied shell commands.

### FR-02: Policy interpretation and approval
Gemini converts the policy into a structured proposed contract containing rule ID, scope, preconditions, actions, expected outcome, and evidence sources. The operator reviews it before the baseline suite is frozen. Ambiguous policies enter `NEEDS_REVIEW`; the system must not silently invent financial semantics.

The final oracle is executable deterministic logic approved by a human, not an LLM confidence score. In the four-hour MVP, the supported contract shape is intentionally restricted to duplicate checkout.

### FR-03: Baseline reproduction
Run the selected scenario in a fresh browser context and fresh target state. Store the original failure, screenshot, trace, relevant requests, and state observations. No application patch may be called “verified” unless the baseline actually reproduced the target violation. Non-reproduction is reported explicitly.

### FR-04: Evidence-based diagnosis
Gemini receives the policy, approved contract, selected screenshots, timestamped requests/events, and bounded source files. Its explanation must refer to observed evidence IDs and source paths. Hypotheses are labeled separately from verified observations.

### FR-05: Bounded application patch
Accept a unified diff against the recorded baseline revision. Default scope is a maximum of three application files. The patch cannot modify tests, fixtures, test configuration, expected values, mock-payment behavior, the harness, package manifests, lockfiles, startup commands, or result-reporting code. Reject symlink/path escapes and changes outside the allowlist.

Do not permit dependency installation or arbitrary commands from the model. Compilation and execution commands are fixed by the trusted harness. A fresh workspace is used per candidate; failed candidates never overwrite the baseline.

### FR-06: Independent verification
Execute the frozen tests from the trusted runner, not from a model-controlled test command. Compare the contract/test/config/fixture hashes before and after. Check expected test IDs and count, no `skip`, no `fixme`, no `only`, and no missing results. A timeout, process crash, missing evidence, hash mismatch, or changed fixture is never a pass.

Cross-check actual order-store records and mock-provider ledger entries, not just DOM text or an application endpoint that reports “count: 1.” The runner reads the order store directly through a read-only observer. The mock provider owns its append-only ledger and permits the target only the fixed charge API, not reset/read/write administration. Only the runner can reset or read that ledger. Evidence files and observer code belong to the runner, outside the candidate write scope. The proof records where each observation came from. The order store remains application-writable by design, so it is a state cross-check, not an adversarially independent source. Describe the payment oracle as isolated only if runtime permissions actually enforce this boundary.

### FR-07: Candidate iteration
Maximum two patch attempts per run. Each attempt includes compile check, original regression, and normal-path suite. Stop on success, exhausted budget, invalid diff, protected-resource modification, or infrastructure failure. A later passing retry must not erase the earlier failure; all attempts stay visible.

### FR-08: Human control
The operator approves the test contract and any proposed export/apply action outside the disposable environment. No real external action is performed. Automatic patch execution is available only if the event-approved isolated runner is confirmed. Otherwise require manual diff review before execution against the fixed synthetic target, and label this reduced-autonomy mode honestly.

### FR-09: Evidence export
Export a patch, Markdown report, machine-readable result manifest, original and final test results, screenshots, and trace/video links. Each report includes source revision, patch hash, protected-suite hash, model ID, attempts, durations, original input, result classification, and limitations.

## 6. Verification semantics

Use separate outcome dimensions instead of a single ambiguous `ok` flag:

- **Execution status:** completed / infrastructure_error / timed_out / cancelled.
- **Baseline status:** reproduced / not_reproduced / inconclusive.
- **Patch status:** proposed / rejected / applied_in_sandbox / compile_failed.
- **Verification status:** passed / failed / inconclusive / not_run.
- **Human approval:** pending / approved / rejected.

`VERIFIED_IN_SCOPE` is possible only when:
- the target violation was reproduced before the patch;
- the same approved regression passes after the patch;
- every required normal-path test passes;
- the expected test set is present, with no skipped or focused tests;
- protected inputs are unchanged;
- evidence was captured and is readable;
- the build and required checks completed without infrastructure errors.

“Patch generated,” “server started,” “HTTP 200,” “no console errors,” and “LLM says fixed” are explicitly insufficient.

Do not call the product a formal proof system. The output is scoped empirical verification.

## 7. Acceptance tests

All fixtures and tests are written during the event, then reviewed and frozen before repair begins. Tests should remain outside the repair agent's write boundary. Independent human-defined requirements matter more than merely asking another instance of the same model to judge the patch.

### AT-01: Ordinary checkout
One valid request with one intent produces exactly one order and one simulated charge, with the correct total and a confirmation UI.

### AT-02: UI repeated submission
Two rapid actions on the same purchase intent, during a controlled provider delay, produce one order and one charge after repair. The seeded baseline must visibly fail a relevant duplicate-order assertion.

### AT-03: Server-side duplicate delivery
Bypass the UI button and send two concurrent requests using the same intent/key. Expect one order and one charge. This rejects a superficial button-disable-only repair.

### AT-04: Lost-response retry
Commit the first purchase but withhold/delay the response; retry using the same key. Expect the original order/charge, not a new one. Replay behavior must be defined in the approved contract.

### AT-05: Legitimate second purchase
Submit a new intent with the same items. Expect two total legitimate orders and two charges across the two distinct intents. This rejects a global lock that disables all future checkout.

### AT-06: Verification integrity
Submit a candidate diff that touches a protected test/config/fixture path. The harness must reject it without executing it. A skipped test, altered expectation, missing test ID, or changed protected hash also rejects verification.

### P0/P1 cut line
AT-01, AT-02, AT-03, AT-05, and AT-06 are P0. AT-04 is P1 if time permits. The final report must enumerate which were actually implemented and run; it must not imply AT-04 coverage when absent.

### Rehearsal target
Three fresh-state runs with no hidden automatic test retry. Vary delay and repeat count within a supported small range, e.g. 200/800/1500 ms and two/three attempts. Exact selections are fixed and logged before each run. A three-minute live demo runs one representative input, not an unbounded stress campaign.

## 8. Architecture and reuse decisions

### Trusted control plane
A small TypeScript service and web UI on Google Cloud handles the state machine, policy review, model requests, fixed commands, artifact indexing, and result aggregation. Use the simplest familiar UI stack; a charting library and a database are not required for this single-run MVP.

### Model adapter
Use the model and API actually provided by the event. The guide names `gemini-4-argon` and an Antigravity managed agent, but their availability and exact API behavior have not been verified in the provided event account. Store model ID and API version in the manifest. Do not hard-wire unverified SDK parameters into the design. Prefer one lead model and bounded calls.

### Execution and isolation gate
Preferred: an event-approved isolated execution environment, with a disposable application workspace, fixed runner commands, read-only protected fixtures, limited network access, and no control-plane/API secrets available to target code.

At kickoff, verify that the supplied environment actually supports the required process, filesystem, network, and artifact operations. The guide both encourages Managed Agents and prohibits autonomous frameworks such as OpenClaw. Obtain the permitted scope from event staff; do not interpret that text as blanket permission for arbitrary agent frameworks.

Fallback: a fixed, team-owned synthetic target with manually reviewed patches and a separately supervised runner on Google Cloud. Do not accept arbitrary uploaded code and do not market ordinary subprocesses, path allowlists, or hashes as a hardened security sandbox. If safe execution cannot be established, return the patch as unverified rather than claim an autonomous repair demo is complete.

### Deterministic browser layer
Use `@playwright/test`, Chromium, JSON reporting, screenshots, and traces. Pin the package version and matching browser image/binaries. During research, Playwright 1.64.1 installed and enumerated the 24 official example tests, but local browser launch failed before test bodies ran. A separate supported-browser smoke check exercised selected example flows; it is not a full test-suite or AI-agent pass. See the companion report. No assumption is made about the event image's installed version.

### Oracle and state cross-checks
The trusted runner owns the contract and reads the order store and mock-payment ledger through the boundaries specified in FR-06. The app cannot replace the observer with an endpoint that simply returns the expected answer. Read-only mounts, separate credentials, and process/network restrictions must enforce the boundary in an isolated mode; hashes alone do not do this. In reviewed fallback mode, label the evidence as controlled-fixture cross-checks, not protection against malicious application code. Disclose single-instance assumptions; production durability requires transactional storage and a separate design.

### Reuse map
- **microsoft/playwright:** adopt the test runner, browser tooling, traces, reports, and planner/generator concept. Preserve applicable license notices.
- **Playwright healer:** do not allow it to change the frozen acceptance suite. Locator changes can be proposed separately and require a new reviewed contract version, invalidating the earlier baseline comparison.
- **browserbase/stagehand:** optional future natural-language exploration and action discovery. Not required for the known P0 UI.
- **magnitudedev/browser-agent:** optional future vision-first interaction for difficult kiosk UIs. Do not use visual assertions as the sole order/payment oracle.
- **rjsx197047/AI-Automation-QA-Engineer:** public design comparison only. Do not copy, fork for submission, or execute/reuse its proprietary implementation without permission.

## 9. UI requirements

For P0, use a plain server-rendered page with a form, a run button, polling, and links to the native Playwright report/diff. No React dashboard, custom trace viewer, general upload UI, or rich editor is required. Show four logical sections, which may be simple headings and text:
1. **Policy and scenario:** rule text, supported parameters, approved contract hash.
2. **Before:** recorded failure, screenshot, actual versus expected order/charge counts.
3. **Repair:** evidence-linked diagnosis, candidate diff, current phase, elapsed time.
4. **After:** each protected test result, unchanged-contract check, evidence links, scope warning.

Show explicit states for preparing, reproducing, awaiting approval, analyzing, patching, verifying, failed, and complete. A green summary must be calculated from test results, never directly emitted by the model. All submission-facing labels and exported descriptions are English.

## 10. Minimal interfaces and artifact contract

These are design contracts, not implementation code.

### Run input
`targetId`, `baselineRevision`, `policyText`, `scenarioId`, `scenarioParameters`, `approvedContractVersion`.

### Evidence item
`evidenceId`, `runId`, `phase`, `timestamp`, `type`, `relativeArtifactPath`, `source`, `contentHash`, `redactionStatus`.

### Patch proposal
`baselineRevision`, `diff`, `changedPaths`, `rationale`, `evidenceIds`, `attemptNumber`.

### Verification record
`runId`, `candidateRevision`, `contractHash`, `testManifestHash`, `expectedTestIds`, `results`, `skippedCount`, `infrastructureErrors`, `orderObservation`, `paymentObservation`, `elapsedMs`, `verdict`.

### Control operations
Create run; approve contract; request repair; approve sandbox execution where required; inspect status/events; retrieve evidence; export patch/report. No arbitrary “run command” endpoint.

Use server-sent events or simple polling. Do not add a complex queue unless the selected hosting environment requires it.

## 11. Reliability, privacy, and cost requirements

- Bound model context to relevant files and evidence; no entire home directory or secret files.
- Never place API keys in browser local storage, public GitHub, traces, or exported logs.
- Only synthetic customer and payment data.
- Network allowlist excludes real payment and production services.
- Maximum two patch attempts and one active run for the demo.
- Track time per phase and API usage when exposed by the provider.
- Target 120 seconds for automated work, leaving review and narration time inside the 180-second demo. This is an unmeasured budget, not a latency claim.
- Timeout yields `inconclusive`, not a fabricated successful replay.
- Keep a genuine recorded run as backup. Label recorded playback and distinguish it from live execution.
- Export before event accounts/projects are deleted. No reliance on the temporary deployment after the event.

## 12. Four-hour delivery plan

### 11:20–11:45: De-risk deployment and model access
Verify the actual Google account/model, permitted execution mode, browser launch, artifacts, and deploy a minimal service. If the managed environment is unavailable, choose the reviewed fixed-target fallback now.

### 11:45–12:30: Build baseline and freeze tests
Create the fresh kiosk, mock provider, independent observations, deterministic duplicate reproduction, and P0 acceptance suite. Review the contract and freeze its manifest. The red baseline must exist before building the AI polish.

### 12:30–13:25: Complete repair loop
Connect one model call sequence, validate/apply bounded diffs, rebuild/restart owned target processes, and re-run frozen tests. Do not kill whichever process happens to own a port; track the target process identity.

### 13:25–14:10: Evidence UI and integration
Implement the four sections, truthful state machine, diff, protected-test results, and export. Target first complete real repair by 14:10.

### 14:10–14:40: Rehearsal and scope cut
Run fresh-state cases; remove P1 work if the live loop is not stable. Keep evidence of failures as well as successes. Test at least one invalid/protected-path diff rejection.

### 14:40–15:20: Freeze and submit
Record an English demo, finish English description and README, verify Google Cloud URL, publish permitted source with notices, and back up artifacts. No new features in the last 40 minutes.

This is a high-risk four-hour plan, not an effort guarantee. For a solo participant, use the fixed known UI, a command-line runner, a plain server-rendered Cloud page, and native Playwright evidence. Do not build a custom dashboard or generic source/video upload. Model input can use the screenshot captured automatically by the runner. The deployed service must still start and report actual runs; a static pitch page alone does not meet the event requirement.

Scope cuts in order: remove long-video input, natural-language browser discovery, P1 lost-response recovery, custom visualizations, streamed animation, and packaged ZIP export (individual artifact links suffice). Keep the P0 correctness tests and truthful verdicts. If no baseline and deployed browser launch work by 12:30, stop adding features and resolve that blocker. If a real patch/verification cycle is not working by 14:10, label the project incomplete rather than fabricate success. For a team, separate target/oracle, model/runner, and minimal UI/deployment ownership.

## 13. Three-minute demo storyboard

This is a sequence outline, not a finished pitch script.

- **0:00–0:20:** Identify the operator and the concrete duplicate-order problem.
- **0:20–0:45:** Trigger repeated submission with live input. Show the policy violation and independent counts.
- **0:45–1:10:** Show the frozen contract, screenshot/log evidence, and source-linked diagnosis.
- **1:10–2:15:** Run the bounded patch and verification. Stream actual progress, not an animation detached from execution.
- **2:15–2:45:** Show original regression passing, legitimate second purchase passing, and unchanged tests.
- **2:45–3:00:** State the reusable value and explicit scope: one bug family, synthetic payment, no production-safety claim.

If measured model latency exceeds the available window, show a genuine recorded full repair plus a live rerun of the unchanged verification suite, and label each segment clearly. This fallback may be less compelling than a complete live run; do not pretend otherwise.

## 14. Success metrics and release gates

### Hackathon completion gates
- A deployed Google Cloud service that handles actual input.
- Baseline failure is reproduced, recorded, and linked to the approved policy.
- A model-generated application patch is visible.
- P0 cases pass with the frozen suite, no skip/fixme/only, and no protected changes.
- Browser and independent state evidence agree.
- Required human approvals are explicit.
- Under-three-minute measured demo or truthfully labeled fallback.
- Public GitHub repository, English project description, and English demo video.

### Measurements to report, not invent
Reproduction success across rehearsals; patch success by attempt; elapsed time by phase; total model usage; false-positive cases; missed/skipped/blocked cases; implemented test IDs. Report the small sample size and synthetic setting.

### Post-event research
Evaluate multiple independently seeded faults; separate test-generation quality from repair quality; add held-out scenarios; compare against Playwright-only deterministic tests and generic LLM repair; measure whether an unchanged oracle reduces false “fixed” claims. Expand to timeout recovery and order cancellation only after the duplicate-submission contract is reliable.

## 15. Research basis and limitations

See `GitHub-QA-Harness-Review.ko.md` for repository-specific source links, inspected revisions, actual local execution results, and limitations.

The research inspects reusable components, exercises a limited official example flow, and exposes unsafe success criteria. It does not establish that KioskProof itself already works, that the full local Playwright suite passed, that event-only model APIs are available, or that any complete agentic repair stack has been end-to-end tested with Gemini.

All submitted target-app code, custom harness code, acceptance tests, UI, generated patches used in the demonstration, and demo recordings must be created during the permitted event window. Pre-event work is limited to this design, source/license review, and evaluation of existing upstream tooling. Allowed libraries/starter templates must be distinguished and attributed; do not submit the pre-event research examples as KioskProof demonstration code. Any ambiguity about custom prewritten tests or fixtures must be resolved with the organizers before use.
