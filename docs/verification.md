# Verification record

Measured on October 16, 2026. All orders, purchase intents, and charges are
synthetic. These are small-sample empirical results, not a general repair
benchmark or production payment certification. Cloud statements are dated
repository evidence; they do not assert that any public endpoint is reachable now.

## Actual Google stack

- Official Google Antigravity Python SDK: `0.1.22`.
- Actual inference model: `gemini-4-argon`; no alternate model fallback.
- Multimodal repair input: runner-produced PNG screenshots, timestamped request
  events, direct order-file observations, provider-ledger observations, policy,
  frozen contract, and bounded application source.
- The SDK's tool schemas are disabled, workspace access is empty, subagents are
  disabled, and a deny-all policy remains in place. The minimal agent preset and
  low-thinking option reduce unnecessary context without changing the oracle.
- Argon proposes application source. Python `difflib` serializes its exact
  replacement against the baseline; the controller separately validates,
  reviews, applies, compiles, and verifies the resulting diff.
- Actual usage and conversation IDs are stored per successful model call.
  API version is `unknown` because the SDK does not expose it.

## Run-progress UI behavior

For an active run, the workspace renders a GitHub Actions-style **Jobs & checks**
workflow with four jobs: contract, baseline reproduction, Argon repair, and
protected verification. Jobs show queued, in-progress, waiting-for-approval,
succeeded, or failed state; the two suite jobs expose each acceptance case's
runner-reported status, duration, and timestamp. The controller relays validated
runner progress events, so this is not a simulated timer. A green terminal badge
still depends on the controller verdict, not page text or HTTP success.

`bun run test:ui` is the repository's local UI verification command. It checks
the implementation's UI behavior; it does not verify current Cloud Run
reachability.

## Frozen P0 acceptance coverage

AT-01, AT-02, AT-03, AT-05, and AT-06 were implemented and executed. Ordinary
checkout, repeated UI action, direct duplicate delivery, legitimate new intent,
and protected-path rejection all passed after the final source proposals.

Each baseline reproduced duplicate order and charge records before repair.
Every candidate used the same approved scenario and protected inputs as its
own baseline. All required result IDs were present; there were no skipped,
focused, or silently retried tests. Candidate compilation and Playwright exit
codes were zero. The baseline's expected assertion failures had exit code one.

Verification additionally checks the original contract bytes, protected file
hashes, readable artifacts and attachment references, and process/report
agreement. HTTP success, UI text, and model confidence are not verdict inputs.

## Three final fresh-state local rehearsals

All three used the compact-context source-proposal implementation. Each created
a fresh target, browser context, order store, and simulated-provider ledger.
Approval actions were explicitly recorded as `qa_driver`, not human review.

| Run | Delay | Repeats | Result | Total | Argon repair call |
| --- | ---: | ---: | --- | ---: | ---: |
| `1d4afdcd-a4c1-46f3-9176-6d4e5a568d43` | 200 ms | 2 | VERIFIED_IN_SCOPE | 194.321 s | 40.745 s |
| `2a1f69f3-d3b2-4bca-aa00-4197ef0aa282` | 800 ms | 3 | VERIFIED_IN_SCOPE | 149.324 s | 20.461 s |
| `f4a0d6d5-8d83-424f-9881-eaa6a82f3b14` | 1500 ms | 2 | VERIFIED_IN_SCOPE | 161.006 s | 31.823 s |

The three final proposals passed on their first candidate attempt. Two of three
rehearsals met the 180-second target; one did not. The 120-second automated-work
target was not met locally. Browser/runner overhead is included rather than
removed from the totals. Manual human-review time was not measured.

Original and candidate results, screenshots, videos, native Playwright reports,
patches, model receipts, and protected hashes are retained under
`.kioskproof/runs/<run-id>/`. Each run has `report.md` and `manifest.json`.

## Final Cloud Run browser demonstration

The final observed browser run was genuine Cloud Run UI execution on the isolated
QA workbench, not a mock or local replay:
`https://kioskproof-qa-129147568500.asia-northeast3.run.app`. Run
`d7dcc898-76a4-4de0-8999-f0b99a11ff70` used an 800 ms delay and two repeated
actions. Its actual enum verdict is `VERIFIED_IN_SCOPE`.

Primary evidence is retained in
`.kioskproof/cloud-demo-backup/runs/d7dcc898-76a4-4de0-8999-f0b99a11ff70/run.json`,
with matching `manifest.json` and `report.md`. The run manifest records a
reproduced baseline, passed verification, Google Antigravity with
`gemini-4-argon`, 202 evidence entries, and matching protected hashes. Evidence
storage is GCS bucket `h2gdm-hack26icn-2705-kioskproof-demo-e11cbae`.

- The baseline AT-02 and AT-03 each failed with two orders and two simulated
  charges. After repair, AT-01, AT-02, AT-03, AT-05, and AT-06 all passed;
  AT-02 and AT-03 each had one order and one simulated charge, while new-intent
  AT-05 had two legitimate purchases.
- Contract and patch approvals are recorded as actor `qa_driver` (simulated),
  not literal human review.
- The real browser recording is
  `.kioskproof/demo/2026-10-16T06-22-00-803Z/kioskproof-demo.webm`. `ffprobe`
  reports 72.000 seconds, 1440x1000 VP9, at 25 fps. The paired recorder capture
  is `recorded-run.json` in the same directory.

The final source was commit `2e5b038`, committed and pushed by its sole author,
MoerAI. Cloud Build `d2960346-3c94-47f6-96a4-6753e531e511` reported `SUCCESS`. Image
digest `sha256:ddd34299b8ef43de6bc2612cbb9c51fd5c0f19740954ebcc702687da58aa7aeb`
was verified on both the primary and isolated QA deployments.

The primary public workbench,
`https://kioskproof-129147568500.asia-northeast3.run.app`, deliberately retains
an old, unowned review run awaiting a patch. Preserve it; do not treat it as the
final result. These are dated observations, not current-availability or latency
guarantees. The target remains synthetic and fixed, with simulated charges; this
is neither a real-payment test nor a formal proof.

## Earlier failures are retained

- `1715e55b-a795-41a4-b8df-5a16df94c723`: the original model-authored unified
  diff did not apply to the exact source. It was not executed. This motivated
  deterministic diff serialization from the model's replacement source.
- `98907697-19c0-4e57-be86-9f0cf8cecf1c`: a model call exceeded the explicit
  180-second ceiling. It is recorded as timed out, never passed. Disabling
  irrelevant tool context and using bounded low-thinking inference addressed
  the subsequent workflow.
- Two earlier direct-diff runs, `248c22e9-a758-4d6f-b377-9dfa7a7c5151` and
  `c1a4557b-6091-4354-ba6a-c9633f76df6e`, passed in 144.706 and 148.988 seconds.
  They are historical runs, not substituted for the three final measurements.

Missing provider usage from a rejected/timed-out protocol result is unknown,
not zero. These samples do not establish a general false-positive or repair
success rate.

## Automated and deployment checks

- TypeScript type checking passed.
- Twenty-five Bun unit tests passed in one run.
- Six desktop/mobile browser checks passed, including the populated patch
  viewport regression and HTTP action boundaries.
- Python language-server diagnostics passed for the bridge.
- The actual Linux amd64 container built successfully, imported the pinned SDK,
  and reported the configured Argon runtime.
- GitHub Actions passed for `ee1f56f` (run `38846691147`), `47870e1`
  (run `38849013915`), `6433f95` (run `38857871794`), and the final UI fix
  `2e5b038` (run `38860208583`).
- Cloud Build `d2960346-3c94-47f6-96a4-6753e531e511` reported `SUCCESS`. Its image
  digest, `sha256:ddd34299b8ef43de6bc2612cbb9c51fd5c0f19740954ebcc702687da58aa7aeb`,
  was verified on the primary and isolated QA deployments.

The initial deployment smoke check used `/healthz`, which Cloud Run reserves;
Google's front end returned 404 without an application request log. The code
now uses `/health`. The actual home and `/api/runs` were already working; the
404 was not treated as proof of an application failure or successful repair.

The final 132-second English film is
`videos/kioskproof-ir/renders/kioskproof-ir-intro-plus-demo.mp4`. HyperFrames
0.8.36 strict rendering succeeded after its composition lint reached zero errors
and zero warnings. `npm run check:film` passed for the 60+72-second timeline,
English scene markup, final source SHA-256 hashes, and ffprobe-derived full
browser recording duration. This checks the film sources and timing; the
underlying protected checkout verdict remains the run evidence above.

The historical project record is `h2gdm-hack26icn-2705` in
`asia-northeast3`. Its primary public workbench,
`https://kioskproof-129147568500.asia-northeast3.run.app`, intentionally retains
an old, unowned review run awaiting a patch. The isolated QA workbench,
`https://kioskproof-qa-129147568500.asia-northeast3.run.app`, is the dated final
observation. Confirm reachability before using either URL, because this repository
makes no current live-service claim. Credentials are not evidence locations. API
keys stay in Secret Manager and the server environment, not the image, Git,
browser, or exported evidence.

## Explicit limitations

- The target and simulated provider share a process and OS identity. Separate
  directly observed files are controlled-fixture cross-checks, not an
  adversarial isolation boundary.
- Execution is reviewed fixed-target mode, not a hardened sandbox.
- Only one active run and one synthetic checkout bug family are supported.
- AT-04 lost-response recovery, inconsistent-payload conflict coverage,
  distributed durability, retention expiry, and crash recovery are not claimed.
- No real payment, customer data, physical kiosk hardware, or arbitrary
  repository was used.
