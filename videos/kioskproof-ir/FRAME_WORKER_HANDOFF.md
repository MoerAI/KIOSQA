# KioskProof IR — completed composition handoff

Six completed frame compositions live under `compositions/frames/`. The main
`index.html` joins them without gaps into an English-language 60-second
introduction, then plays the entire 72-second browser capture beginning at
t=60. The final Cloud source is run `d7dcc898-76a4-4de0-8999-f0b99a11ff70`
from commit `2e5b03896924652ab39c1421a2e61eb94f806989`. The exact media
hashes are in `assets/manifest.json`.

Future edits must keep on-screen explanations in English and the actual
captured UI pixels unchanged. The recorded `qa_driver` approval actions are
simulated operator actions, not literal human approvals. Only one fixed-target
synthetic checkout is demonstrated; real payments and AT-04 recovery remain
outside scope. Do not add narration, music, overlays over the real demo, or
substitute a historical run for the final source.

The video project's machine-readable integrity check is `npm run check:film`.
HyperFrames `0.8.36` lint and render commands are in `package.json`; the
render invocation and output path are in `BRIEF.md`.
