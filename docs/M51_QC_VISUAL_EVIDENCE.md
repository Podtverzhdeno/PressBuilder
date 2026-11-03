# M51-R06 — QC browser visual evidence and mobile layout QA

**Scope:** review-only visual witness for M51-R05 (PR #58), stacked in a
separate Draft branch. This is NOT an approval of audio quality or security,
and it does not change any production flags.

## Evidence recorded in GitHub Actions

The containerized **real Chromium** smoke test uses a **synthetic** 2.4-second
H.264/AAC master with an antiphase segment. It opens the protected editor,
clicks the manual audio audit button, verifies an exact-release SHA receipt
and renders review-only findings in the QC cockpit.

It then captures:

- `qc-audio-desktop-1280.png`: full desktop QC dialog with verified
  synthetic antiphase warnings and no publication permission.
- `qc-audio-mobile-390.png`: responsive 390×844 Chromium viewport,
  scrolled to the real-master audio summary and its approximate PCM times.
- `qc-audio-visual-evidence.json`: bounded non-sensitive test metadata,
  viewport dimensions, fixture status and review-only flags.

All three files are uploaded to the **private GitHub Actions artifact**
`qc-audio-visual-evidence`, retained for **14 days**. The CI screenshot
runner is independent from production and never uses customer media, passwords
or bearer tokens in filenames, JSON or page-visible content.

The browser test checks that on mobile:
- the QC dialog remains inside the viewport, with no modal horizontal overflow;
- the report remains scrollable and warnings readable;
- its Close button can receive keyboard focus;
- manual audio review findings do not become P07 VERIFIED or authorize
  publication.

The test **fails rather than skips in Docker** if Chromium/FFmpeg is missing.
A host without those dependencies may skip the browser test; it must pass in
the Docker build and the separate evidence capture run.

## Human review checklist (NOT automatically signed)

A human reviewer should open the two PNG screenshots in the Actions artifact
and verify the actual text size, contrast, visual spacing, mobile header,
video-player position, scrollbars, warning placement and table legibility.
Tests can prove visibility and bounds, **not** perceptual usability or full
WCAG 2.2 AA compliance. The browser fixture does not validate the sound by
listening, A/V PTS, recording rights, or any release/publication entitlement.

If the screenshot artifact is absent, incomplete or not manually inspected,
the UI must **not** be described as visually accepted. No merge/deploy,
turning on `PB_REAL_AUDIO_AUDIT`, or release approval follows from
these artifacts alone.
