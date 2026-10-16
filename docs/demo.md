# English demonstration

The repository retains a recorded Cloud Run QA demonstration from October 16,
2026. It documents that dated run only; it does not assert that its former public
URL is reachable now. In the recorded browser and reports, Google Antigravity,
the actual `gemini-4-argon` model, SDK version, conversation ID, token usage,
and elapsed inference time are identified.

1. **The rule.** "One purchase intent must produce one order and one simulated
   charge, even when the customer repeats checkout."
2. **The failure.** Approve the contract and show the red baseline. "The UI loaded
   successfully, but the directly observed order file and provider ledger both
   contain duplicate side effects."
3. **The investigation.** "Google Antigravity gives Gemini 4 Argon the policy,
   frozen contract, actual screenshots, timestamped events, and application
   source. These are observations; these are hypotheses."
4. **The repair.** Show the source diff and its evidence references. "Argon
   proposes the application change. It cannot edit the tests or the definition
   of success." Review and approve the patch.
5. **The evidence.** When the controller reports an actual `VERIFIED_IN_SCOPE`
   verdict, show the protected cases, unchanged hashes, report, manifest, patch,
   screenshots, and traces. Do not substitute a toast, page load, or model
   explanation for that verdict.
6. **The scope.** "This is a reviewed synthetic target, not a hardened sandbox or
   production payment certification. Lost-response recovery is not covered."

## Live progress view

While the run is active, use **Jobs & checks** as the visual narrative. It is a
GitHub Actions-style view of the four real jobs: contract, baseline reproduction,
Argon repair, and protected verification. Expand the baseline or verification job
to show each protected case's runner-reported status, elapsed time, and timestamp.
A waiting job means an approval is required; it is not background work. Do not
call the archived recording a live run.

## Recording command for a reachable deployment

The historic endpoint used by the recorded evidence is
`https://kioskproof-129147568500.asia-northeast3.run.app`. Confirm that a target
deployment is reachable before recording; this repository does not claim that the
historic URL remains online.

```bash
export KIOSKPROOF_URL="https://kioskproof-129147568500.asia-northeast3.run.app"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
bun scripts/record-demo.ts
```

When pointed at a reachable deployment, the recorder exercises the actual web form
and approval buttons, using exact DOM state-change subscriptions. It labels the
recording and marks its approvals as `qa_driver`, not human review. It does not
replace model output, mock the result, change the oracle, edit the video, or
present a recording as a live run.

The archived WebM, screenshots, and recorded run JSON are in
`.kioskproof/demo/2026-10-16T04-29-44-023Z/`; `kioskproof-demo.webm` is 99.520
seconds. New recordings are written under `.kioskproof/demo/`. A failed recording
remains a failed run. Measure its duration; do not assert a three-minute
demonstration if the actual recording exceeds that target.
