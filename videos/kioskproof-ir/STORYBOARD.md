---
format: 1920x1080
duration: 132s
intro_duration: 60s
demo_clip_start: 60s
demo_clip_duration: 72s
language: en
music: none
narration: no
---

# KioskProof — Fix the app. Keep the proof.

The first 60 seconds are six original, English-language HyperFrames scenes.
Each scene combines sparse editorial type with an unchanged screenshot from
Cloud run `d7dcc898-76a4-4de0-8999-f0b99a11ff70`. The final 72 seconds are
the full genuine browser recording from that run, in order and at 1.0x. No
synthetic browser UI, substituted outcome, narration, music, or overlay appears
on the demonstration.

## Frame 1 — A fix needs evidence

- Time: 0–8s
- Source: `compositions/frames/01-proof-is-the-product.html`
- Plate: `assets/final-verified.png`
- Reveal: a fix alone is not enough; the completed run's recorded proof remains.

## Frame 2 — Freeze the rule first

- Time: 8–18s
- Source: `compositions/frames/02-freeze-the-contract.html`
- Plate: `assets/final-contract.png`
- Reveal: the explicitly reviewed synthetic checkout contract fixes the one
  intent / one order / one simulated charge behavior before any repair.

## Frame 3 — Reproduce the failure

- Time: 18–29s
- Source: `compositions/frames/03-reproduce-before-repair.html`
- Plate: `assets/final-before.png`
- Reveal: AT-02 and AT-03 fail before repair; duplicate delivery produced two
  orders and two simulated charges.

## Frame 4 — Link the patch to evidence

- Time: 29–41s
- Source: `compositions/frames/04-link-the-patch-to-evidence.html`
- Plate: `assets/final-patch.png`
- Reveal: observed facts lead to a bounded Argon application patch; recorded
  approval is marked `qa_driver (simulated)`, never passed off as human review.

## Frame 5 — Verify the same contract

- Time: 41–52s
- Source: `compositions/frames/05-verify-the-same-contract.html`
- Plates: `assets/final-before.png` and `assets/final-verified.png`
- Reveal: the same protected suite passes AT-01/02/03/05/06 with protected
  hashes unchanged. Repeated intent now yields one order and one simulated
  charge. No real-payment safety or AT-04 coverage is claimed.

## Frame 6 — Decide with proof

- Time: 52–60s
- Source: `compositions/frames/06-evidence-decides.html`
- Plate: `assets/final-verified.png`
- Reveal: brand thesis, synthetic scope, and a clear handoff to the real demo.

## Full Cloud browser demo

- Time: 60–132s
- Source: `assets/cloud-recording.webm`, 72.000 seconds at 1440×1000/25fps.
- Composition: `index.html` mounts one muted video at source time zero; the
  genuine recording contains no audio stream. The picture is letterboxed, not
  cropped. The root renders at 1920×1080/30fps.
- Proof: `assets/manifest.json` binds the recording and final plates to their
  source SHA-256 and run ID. `npm run check:film` checks timing, English
  frame markup, source hashes, and the recording's measured full duration.
