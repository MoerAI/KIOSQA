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

## Recorded Cloud Run browser demonstration

Repository evidence records run `41a794ce-6500-4570-b421-4e510e075a72` as an
actual public Cloud Run UI run, not a mock or local replay. This is a historical
October 16, 2026 result, not a claim that the endpoint remains online. Parameters
were 800 ms and two repeated actions.

Primary evidence is retained in
`.kioskproof/cloud-backup/runs/41a794ce-6500-4570-b421-4e510e075a72/run.json`,
with the matching `manifest.json` and `report.md` alongside it. The run record is
`VERIFIED_IN_SCOPE`, records GCS storage in
`h2gdm-hack26icn-2705-kioskproof-evidence`, and contains 202 evidence entries.

- Backend run time: **89.600 seconds**, meeting the 120-second target for this
  one sample.
- Automated browser workflow: **98.582 seconds**.
- Actual WebM duration measured with `ffprobe`: **99.520 seconds**, meeting the
  180-second recorded-demonstration target.
- Argon repair call: **55.612 seconds**, 29,550 reported total tokens,
  conversation `da6da00cf4156e3fc69cd3e9cabfdbdc`.
- Baseline AT-02 and AT-03 each observed two orders and two charges. Both
  candidate cases observed one order and one charge.
- AT-01, AT-02, AT-03, AT-05, and AT-06 all passed; protected hashes were
  unchanged. AT-05 observed two legitimate distinct-intent purchases.
- All 202 evidence entries were captured, with storage mode `gcs`, bucket
  `h2gdm-hack26icn-2705-kioskproof-evidence`, and no export error.
- Contract and patch approvals were explicitly `qa_driver`, not human review.
  The video also labels itself as a recorded QA demonstration.

The genuine recording and screenshots are in
`.kioskproof/demo/2026-10-16T04-29-44-023Z/`; the video is
`kioskproof-demo.webm` (9,328,745 bytes). `recorded-run.json` contains the actual
run, not a manually assembled result. The recorder subscribed before patch
approval and awaited the server's final export event.

This is one measured Cloud demonstration, not a latency guarantee.

The repository's Cloud-evidence backup contains 213 files under
`.kioskproof/cloud-backup/`. The downloaded contract, application patch, and
protected-suite manifest hashes match the verified Cloud run. The recording and
this local backup survive deletion of the event project.

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
- Twenty Bun unit tests passed in one run.
- Six desktop/mobile browser checks passed, including the populated patch
  viewport regression and HTTP action boundaries.
- Python language-server diagnostics passed for the bridge.
- The actual Linux amd64 container built successfully, imported the pinned SDK,
  and reported the configured Argon runtime.
- GitHub Actions passed for `ee1f56f` (run `38846691147`) and `47870e1`
  (run `38849013915`).
- Cloud Build `21e4c73b-3175-4bcf-8a6b-e36461f1d8b7` succeeded in 3m34s.
  Cloud Run revision `kioskproof-00001-m75` became ready and served the real
  application home and run API with HTTP 200.

The initial deployment smoke check used `/healthz`, which Cloud Run reserves;
Google's front end returned 404 without an application request log. The code
now uses `/health`. The actual home and `/api/runs` were already working; the
404 was not treated as proof of an application failure or successful repair.

The historical project record is `h2gdm-hack26icn-2705` in
`asia-northeast3`. Its recorded public workbench endpoint is
`https://kioskproof-129147568500.asia-northeast3.run.app`; confirm reachability
before using it, because this repository makes no current live-service claim.
Credentials are not evidence locations. API keys stay in Secret Manager and the
server environment, not the image, Git, browser, or exported evidence.

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
