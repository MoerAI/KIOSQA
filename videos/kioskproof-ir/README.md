# KioskProof — English product film

Watch `renders/kioskproof-ir-intro-plus-demo.mp4` (132 seconds, 1920×1080,
30 fps). The first 60 seconds are six HyperFrames introduction scenes. The
remaining 72 seconds are the complete original browser recording of a genuine
GCP run, without cuts, cropping, overlays, narration, or music.

The source of record is Cloud run `d7dcc898-76a4-4de0-8999-f0b99a11ff70`
from deployed UI commit `2e5b038`. All actual final-run screenshots and the
WebM are bound by SHA-256 in `assets/manifest.json`. Approvals in the recording
were simulated by `qa_driver`; transactions are synthetic.

```bash
cd videos/kioskproof-ir
npm run check:film
npm run hyperframes:check
npx --yes hyperframes@0.8.36 render --strict --quality high --fps 30 \
  --workers 8 --video-frame-format png \
  --output renders/kioskproof-ir-intro-plus-demo.mp4
```

`BRIEF.md` records the scope, `STORYBOARD.md` the scene timing, and
`CREDITS.md` the media provenance. The complete browser recording was
deliberately included in GitHub alongside the MP4 for independent inspection.
