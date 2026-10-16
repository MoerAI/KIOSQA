---
workflow: product-launch-video
flow: automation
message: "KioskProof makes bounded code repairs reviewable through a frozen policy, observed failure, and unchanged protected tests."
destination: investor-pitch
aspect: 1920x1080
language: en
audience: investors and technical judges
length: 132s
angle: Demo Loop
narration: no
---

# KioskProof — Fix the app. Keep the proof.

This film contains a newly composed, all-English, 60-second HyperFrames introduction
followed immediately by the complete 72-second real browser recording from the
deployed Google Cloud service. The introduction borrows only the six-beat timing
and spare typography of the supplied AISTORY reference; the color and evidence
come from KioskProof itself.

The six beats show the product's actual workflow: freeze the rule, reproduce the
failure, review the evidence-linked application patch, verify the unchanged
protected cases, and hand off to a continuous browser demonstration. Screens
remain actual captures rather than recreated UI. No narration or background
music is used. The source browser video is silent; its entire picture is used
from time zero at 1.0x with no crop or overlays.

## Sources and limits

- Product revision: `2e5b03896924652ab39c1421a2e61eb94f806989`.
- Google Cloud QA run: `d7dcc898-76a4-4de0-8999-f0b99a11ff70`.
- Final screens: `assets/final-contract.png`, `assets/final-before.png`,
  `assets/final-patch.png`, `assets/final-verified.png`.
- Complete 72-second browser recording: `assets/cloud-recording.webm`.
- SHA-256 values and original source paths: `assets/manifest.json`.
- Before repair, duplicate delivery created 2 orders and 2 simulated charges;
  afterward, 1 order and 1 simulated charge. AT-01/02/03/05/06 passed with
  protected hashes unchanged. AT-04 and real payments are outside this claim.
- The recorded approvals were performed by `qa_driver` for a demonstration;
  the footage does not represent them as literal human approvals.

The finished film lives in `renders/kioskproof-ir-intro-plus-demo.mp4`.
To re-render from this project, run
`npx --yes hyperframes@0.8.36 render --strict --quality high --fps 30 --workers 8 --video-frame-format png --output renders/kioskproof-ir-intro-plus-demo.mp4`.
