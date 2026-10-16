# English demonstration

The repository retains a genuine browser QA recording of the final isolated Cloud
Run run from October 16, 2026:
`d7dcc898-76a4-4de0-8999-f0b99a11ff70`. It documents that dated observation only;
it does not assert that either Cloud Run URL is reachable now. The recorded browser
and run report identify Google Antigravity, the actual `gemini-4-argon` model, SDK
version, conversation ID, token usage, and elapsed inference time.

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

The recorder's contract and patch approvals have actor `qa_driver` and are
simulated; they are not literal human review. This is a synthetic fixed-target
demonstration with simulated charges, not a real-payment test or formal proof.

## Live progress view

While the run is active, use **Jobs & checks** as the visual narrative. It is a
GitHub Actions-style view of the four real jobs: contract, baseline reproduction,
Argon repair, and protected verification. Expand the baseline or verification job
to show each protected case's runner-reported status, elapsed time, and timestamp.
A waiting job means an approval is required; it is not background work. Do not
call the archived recording a live run.

## Recording command for the observed QA deployment

The final recording used the isolated QA workbench:
`https://kioskproof-qa-129147568500.asia-northeast3.run.app`. Confirm that a
target deployment is reachable before recording; this repository does not claim
that the observed URL remains online. The primary public workbench,
`https://kioskproof-129147568500.asia-northeast3.run.app`, deliberately retains
an old, unowned review run awaiting a patch and must not be substituted for the
final evidence.

```bash
export KIOSKPROOF_URL="https://kioskproof-qa-129147568500.asia-northeast3.run.app"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
bun scripts/record-demo.ts
```

When pointed at a reachable deployment, the recorder exercises the actual web form
and approval buttons, using exact DOM state-change subscriptions. It labels the
recording and marks its approvals as `qa_driver`, not human review. It does not
replace model output, mock the result, change the oracle, edit the video, or
present a recording as a live run.

The genuine WebM, screenshots, and recorder output are in
`.kioskproof/demo/2026-10-16T06-22-00-803Z/`; the video is
`kioskproof-demo.webm`. `ffprobe` reports a 72.000-second, 1440x1000 VP9 stream
at 25 fps. `recorded-run.json` is the recorder capture; the matching final-run
source is `.kioskproof/cloud-demo-backup/runs/d7dcc898-76a4-4de0-8999-f0b99a11ff70/run.json`.
New recordings are written under `.kioskproof/demo/`; a failed recording remains
a failed run.

The finished, all-English film is
`videos/kioskproof-ir/renders/kioskproof-ir-intro-plus-demo.mp4` (132 seconds,
1920x1080 at 30 fps). The first 60 seconds are six original HyperFrames
introduction scenes using unchanged final-run screenshots. At exactly 60 seconds,
the complete 72-second real browser WebM plays once in order at 1.0x, without
cropping, voiceover, overlays, or music. The browser recording has no audio
stream. Run `cd videos/kioskproof-ir && npm run check:film` to check the
composition timing, English frame markup, SHA-256 evidence, and measured source
duration; the pinned render command is in `videos/kioskproof-ir/BRIEF.md`.
