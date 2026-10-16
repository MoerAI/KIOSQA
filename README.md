# KioskProof

**Fix the app. Keep the proof.**

Evidence-first kiosk repair built with **Google Antigravity and Gemini 4 Argon** for the Google DeepMind hackathon on October 16, 2026. Antigravity interprets an operating rule and gives Argon real screenshots, request history, observed state, and bounded source. Argon proposes an application diff. An unchanged Playwright suite, not the model, determines the result.

Recorded Cloud Run workbench URL (used by the October 16, 2026 evidence run; current reachability is not asserted): `https://kioskproof-129147568500.asia-northeast3.run.app`

This repository implements the P0 synthetic duplicate-checkout scenario in `KioskProof-PRD.md`. The supplied PRD and research remain design/research records; measured implementation results belong in `docs/verification.md` and exported run manifests.

## Run locally

Requires Bun 1.3.14, `uv`, Python 3.12, and Chromium or Google Chrome.

```bash
bun install --frozen-lockfile
bun run agent:setup

# The event file stays outside the repository.
set -a
source ~/.config/gdm-hackathon/h2gdm-hack26icn-2705.env
set +a
export GEMINI_MODEL=gemini-4-argon

# macOS: use the installed browser. Otherwise install matching Chromium below.
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
bun start
```

Open `http://localhost:8080`. For the bundled Playwright browser instead:

```bash
bunx playwright install chromium
unset PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
```

The home page shows whether the agent runtime is configured. A missing key/runtime is an error, not a canned demonstration. The only configured model is `gemini-4-argon`; there is no silent fallback. The Python bridge uses `google-antigravity==0.1.22`, Pydantic validation, image attachments, and a deny-all agent tool policy. No model shell commands are executed.

## Operator workflow

1. Enter the operating rule and choose a supported delay (200/800/1500 ms) and repeat count (2/3).
2. Review Argon's structured contract and approve its displayed SHA-256. This freezes the policy, scenario, oracle, tests, and fixture.
3. Inspect the original failing checkout, screenshot, direct order-file observations, and separately owned simulated-payment ledger.
4. Request an Antigravity investigation. Review its evidence references, observed facts, labelled hypotheses, and actual unified diff.
5. Approve the displayed patch hash. The harness creates a fresh candidate, type-checks it, and executes the same five protected cases.
6. Export the Markdown report, JSON manifest, application patch, raw results, native Playwright report, screenshots, traces, and videos.

## Run progress UI

During an active run, the workspace presents a GitHub Actions-style **Jobs & checks** view: define and freeze the rule, reproduce the defect, review the Argon repair, and verify unchanged checks. Each job reports queued, in-progress, awaiting-approval, succeeded, or failed state. The baseline and verification jobs expand to show protected-case status, duration, and runner timestamp.

This progress comes from validated runner events and controller state, not an inferred countdown or a success toast. A terminal `VERIFIED_IN_SCOPE` badge still requires the controller's reproduced baseline, successful compilation, complete protected suite, unchanged hashes, approvals, and readable evidence.

Only `target/checkout.ts` is patchable. Tests, mock payments, observer, harness, startup commands, packages, lockfile, and configuration are protected. An invalid diff stops the run without execution. A failed candidate never replaces the seeded source. A second attempt is available after a completed compiler failure or a completed failed regression, with the previous failure supplied as bounded context. Timeouts, process crashes, invalid patches, and protected-resource changes stop the loop. There are at most two attempts and one active run.

The deployment is intentionally **reviewed fixed-target mode**, not a hardened sandbox. Contract and patch approvals are separate API operations bound to the exact content hash. No arbitrary URL, repository upload, user-supplied command, real purchase, or production deployment is accepted.

Argon proposes the repaired application source; the trusted adapter computes its exact unified diff with `difflib`. This avoids asking a language model to count hunk lines. The model still authors the application change, and the same allowlist, review, compilation, and frozen oracle remain mandatory. The target and simulated provider share a process and OS identity; their separate directly observed files are controlled-fixture cross-checks, not adversarial isolation.

## What is verified

| Case | Required behavior |
| --- | --- |
| AT-01 | Ordinary checkout creates one order and one simulated charge for USD 14.50. |
| AT-02 | Repeated UI actions with the same intent create one order and charge. |
| AT-03 | Concurrent direct duplicate delivery also creates one order and charge. |
| AT-05 | A new intent with identical items still creates a legitimate new purchase. |
| AT-06 | A patch against protected resources is rejected without execution. |

AT-04 lost-response recovery is not implemented or claimed. Keys last only for the single-instance scenario. Distributed durability, process-crash recovery, retention expiry, and real financial correctness are outside scope.

Tests start fresh browser/target/provider state. Trusted ingress events coordinate concurrent delivery with a provider barrier; the test does not hope that arbitrary sleeps overlap. The provider's selected delay models latency after release. A five-second completion deadline starts when that barrier releases.

`VERIFIED_IN_SCOPE` requires a genuinely reproduced baseline, the full expected test set, all required cases passing without retries/skips/focus, unchanged protected hashes, successful compilation, explicit approval operations, and readable evidence. HTTP 200, a confirmation toast, and an LLM explanation are never sufficient.

## Checks and rehearsal

```bash
bun run typecheck
bun test tests/unit
bun run test:ui

# Real event-model calls; interactively inspect and approve each contract/diff.
bun run rehearse

# Developer-only QA simulation, truthfully recorded as qa_driver approvals.
bun run rehearse --qa --one
# Three declared fresh-state scenarios:
bun run rehearse --qa
```

The rehearsal subscribes to server-sent run events before each action; it does not poll or silently retry a failed run. `--qa` is not represented as human review or organizer authorization. The web UI supports the normal manual workflow.

For a new English UI recording, run `bun scripts/record-demo.ts` with
`KIOSKPROOF_URL` set to a deployment you have confirmed is reachable. The recorder
labels simulated operator actions and waits for the final durable-export event. The
repository's historical Cloud Run endpoint is recorded above; see `docs/demo.md`.

## Google Cloud

The container pins matching Playwright `1.64.1` package and browser image, Bun `1.3.14`, and the Antigravity SDK. Cloud Build creates the image; Cloud Run runs the service; Secret Manager holds the event key; Cloud Storage preserves evidence.

Review `scripts/deploy.sh` before explicitly running it with an account authorized in the event project:

```bash
gcloud auth login
bash scripts/deploy.sh ~/.config/gdm-hackathon/h2gdm-hack26icn-2705.env
```

The script creates a dedicated runtime identity, grants it access to its secret and evidence bucket, and deploys one Cloud Run instance with always-allocated CPU. Background model and browser tasks must continue between HTTP requests. The service is public for the event demo; approvals and synthetic-target restrictions still apply. The script uses the key on stdin to Secret Manager, never in image layers, Git, command-line arguments, or browser storage.

The event API key alone does **not** grant Cloud Run deployment permission. A Cloud project access failure is a deployment blocker, not a reason to claim a live Cloud URL. `docs/verification.md` and `.kioskproof/cloud-backup/runs/41a794ce-6500-4570-b421-4e510e075a72/` retain the dated deployment evidence; neither asserts that the recorded URL is currently available.

The public readiness endpoint is `/health`. Cloud Run reserves some URL paths
ending in `z`; the deployed smoke test must not use `/healthz`.

With `GCS_BUCKET` configured, phase exports are uploaded through the Cloud Run service identity. Stored runs and artifacts are restored on a new instance; work interrupted by a restart is marked inconclusive, never passed. Local development keeps evidence under `.kioskproof/runs/<run-id>/`. Each UI report link serves the actual generated file.

Export event data before project deletion:

```bash
gcloud storage rsync --recursive \
  gs://h2gdm-hack26icn-2705-kioskproof-evidence \
  .kioskproof/cloud-backup --project=h2gdm-hack26icn-2705
```

## Source map

- `src/control.ts`: approvals, state machine, bounded attempts, freeze/replay, truthful verdicts.
- `src/model.ts`, `agents/antigravity_bridge.py`: actual Antigravity/Argon execution and receipts.
- `target/checkout.ts`: deliberately vulnerable, application-only repair target.
- `runner/`: trusted target adapter, order observer, mock provider, and result aggregation.
- `tests/acceptance/`: fixed P0 cases; `src/patch.ts` enforces the write boundary.
- `src/ui.ts`, `public/`: server-rendered responsive evidence workbench.
- `src/artifacts.ts`: reports, checksums, and durable Cloud evidence.

All code commits are authored and committed solely as **MoerAI**. Dependency attribution is in `NOTICE`. The supplied research ZIP is retained as input, not confused with new KioskProof execution evidence.
