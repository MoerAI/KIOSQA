---
version: alpha
name: KioskProof Evidence Frame
description: >
  Sparse 16:9 evidence-film system derived from KioskProof's shipped UI.
  Real product screens remain the visual subject; English editorial copy explains
  scope without rebuilding product UI.
unit: the frame — 1920×1080 primary
principle: evidence is the hero · state colors carry only observed state · proof beats breathe

colors:
  canvas: "#f7f6f9"
  surface: "#ffffff"
  rail: "#20182d"
  rail-active: "#372747"
  rail-rule: "#3b2b50"
  ink: "#261f32"
  ink-strong: "#33273c"
  muted: "#685f76"
  border: "#e5e1ec"
  violet: "#7844df"
  violet-strong: "#7440db"
  violet-light: "#a076ed"
  violet-pale: "#b393ff"
  passed: "#197657"
  failed: "#c24657"

typography:
  display: { fontFamily: "NanumSquareRoundB, -apple-system, BlinkMacSystemFont, sans-serif", weight: 700, lineHeight: 0.98, tracking: "-0.055em" }
  headline: { fontFamily: "NanumSquareRoundB, -apple-system, BlinkMacSystemFont, sans-serif", weight: 700, lineHeight: 1.03, tracking: "-0.045em" }
  body: { fontFamily: "NanumSquareRoundB, -apple-system, BlinkMacSystemFont, sans-serif", weight: 400, lineHeight: 1.45, tracking: "-0.01em" }
  label: { fontFamily: "NanumSquareRoundB, -apple-system, BlinkMacSystemFont, sans-serif", weight: 700, lineHeight: 1.2, tracking: "0.14em" }
  mono: { fontFamily: "SFMono-Regular, Consolas, monospace", weight: 400, lineHeight: 1.35, tracking: "0.02em" }

spacing:
  outer-safe: "5.2cqw"
  top-safe: "5.0cqh"
  caption-keep-out: "17cqh"
  rule: "1px"
  radius-card: "10px"
  radius-control: "7px"
  shadow-card: "0 10px 30px #211b3510"

components:
  evidence-window:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    radius: "{spacing.radius-card}"
    shadow: "{spacing.shadow-card}"
    description: "A real captured screen, never a reconstructed browser or dashboard."
  status-chip:
    passed: "{colors.passed} on a pale neutral/green field"
    failed: "{colors.failed} on a pale neutral/red field"
    description: "Use only beside the observed run state; do not turn state colors into decoration."
  evidence-rule:
    color: "{colors.violet-light}"
    size: "2px × 48px"
    description: "Short violet line before an eyebrow or at a typography pivot."
---

# KioskProof Evidence Frame

## Overview

This is a sober, screen-led IR system. It inherits the prior film's rhythm — sparse
large English type, one idea per scene, confident holds, six-beat arc — not its
illustration language. The visual vocabulary is taken from the shipped KioskProof
surface: pale slate canvas, deep plum rail, violet action, thin cool borders and
observed red/green verification states.

## Source fidelity

- `public/workflow.css` is the color source. The normative tokens above quote its
  values verbatim.
- The staged local font and system sans/mono stacks support reproducible English typography.
- Screens in `assets/` are evidence, not mockup ingredients. Keep the KioskProof
  rail, cards, state labels and scope note legible when the screen is visible.
- English copy belongs in a clean editorial layer outside the captured UI. It must
  never replace, translate inside, or alter values in a captured screen.

## Frame craft

- **Canvas:** `canvas` full bleed. A real capture may sit in an `evidence-window`
  at 60–88% of the frame, or run full-bleed behind an opaque/near-opaque text
  field. Never use fake browser chrome.
- **Hierarchy:** one `display` or `headline` block per scene; its counterpart is
  one real screen. The screen is always larger than any decorative form.
- **Type:** English display copy uses `display`/`headline`; evidence labels use
  `label`; hashes, IDs and source ranges use `mono`. Do not invent a serif,
  rounded display face, or gradient text.
- **State:** violet is navigation, sequencing and emphasis; green and red only
  repeat an observed pass/fail status in the selected evidence. No green check
  mark may stand for an unobserved result.
- **Depth:** one subtle card shadow at most. No 3D device shell, glassmorphism,
  blur bloom, particles, or decorative data visualizations.
- **Safe area:** compose inside `outer-safe` and the top 83% of the canvas. The
  bottom 17% remains clear for a future caption band even though this cut has no
  narration.

## Motion posture

Use restrained, seek-safe motion: hard cut or brief crossfade between sections;
short `power3` fades/slides for typography; one controlled crop/push on real
footage only when it makes a documented value readable. No floating UI,
screensaver drift, bouncing counters, synthetic typing, fake loading, or effects
that imply work the recorded product did not perform. Each scene resolves late
enough to earn a readable hold.

## Non-negotiable exclusions

- Do not claim payment safety, real-payment processing, production certification,
  formal verification, or AT-04 coverage.
- Do not redraw the app, patch, test table, run metadata, or simulated checkout
  screen. Crop and annotate the staged files instead.
- Do not use AISTORY cream/coral, storybook assets, or its childlike visual
  components. The reference controls pace, not KioskProof's identity.
