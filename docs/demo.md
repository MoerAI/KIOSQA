# English demonstration

Use the real Cloud Run URL. The browser and reports identify Google Antigravity,
the actual `gemini-4-argon` model, SDK version, conversation ID, token usage,
and elapsed inference time.

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
5. **The evidence.** "The same protected cases now pass. Direct duplicate delivery
   is covered, and a new purchase intent still works. The protected hashes did
   not change." Export the report, manifest, patch, screenshots, and traces.
6. **The scope.** "This is a reviewed synthetic target, not a hardened sandbox or
   production payment certification. Lost-response recovery is not covered."

## Genuine recorded backup

```bash
export KIOSKPROOF_URL="https://kioskproof-129147568500.asia-northeast3.run.app"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
bun scripts/record-demo.ts
```

The recorder exercises the actual web form and approval buttons, using exact DOM
state-change subscriptions. It labels the recording and marks its approvals as
`qa_driver`, not human review. It does not replace model output, mock the result,
change the oracle, edit the video, or present a recording as a live run.

The WebM, screenshots, and recorded run JSON are written to `.kioskproof/demo/`.
A failed recording remains a failed run. Measure its duration; do not assert a
three-minute demonstration if the actual recording exceeds that target.
