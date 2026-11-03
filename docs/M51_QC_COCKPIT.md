# M51-R01 — Source-pinned timecoded QA cockpit

**Status:** partial implementation only; M51 not accepted. Feature `PB_QC_COCKPIT=1` defaults OFF. Studio displays a read-only view, with no automatic moderation, publication or creative signoff.

## Inputs and provenance

- `assembly.current(project)` first verifies the exact live P05 immutable master MP4 against its source manifest SHA, bytes and QA PASS. A missing or corrupt current release fails closed.
- Scene offsets derive from ordered P05 scene durations and explicit transition overlaps. Frame quantization uses the rational M01 240000 ticks/second clock and project target fps. In overlap windows both adjacent source shots may contribute to the frame.
- P07 human review notes are anchored to their exact approved P08 version ID and scene's immutable file SHA. Notes for a different version are ignored and counted, so rollback/asset changes cannot silently revive previously suppressed or fixed observations.
- P05 output QA issues without a PTS are included as `UNLOCATED_TECHNICAL_ISSUE` with `global_pts_tick:null`, not falsely assigned frame zero. QA PASS can still have alerts; those are NOT technical FAIL or artistic approval.
- P06 worker MCP reads only its assigned scene and matching notes; director REST/MCP sees the entire current release.
- Every response contains a deterministic snapshot SHA, release SHA, source SHA/version, P07 review revision and timebase; all responses assert `publication_allowed:false`, `render_allowed:false`. No filesystem path input, external URLs or direct file access.
- In Studio, choosing a timecoded issue seeks the authenticated P05 MP4 video element to its computed global second; untimed issues have no seek action.

## Reproduction / limitations

- `tests/cloud-qc-cockpit.test.mjs`: 20 synthetic P07 findings across a six-scene montage with declared crossfades; clock/source/order consistency, drift and stale version tests.
- `tests/cloud-qc-cockpit-wire.test.mjs`: protected REST, scene-assigned MCP worker, no-release failure, origin/method handling.
- `server/qc-cockpit.mjs`: pure event projection and source-attested read-only service; `src/editor/QcCockpitPanel.tsx`: review UI.
- The timecode here is **estimated from the declared P05 montage**, NOT proven via frame-by-frame decoded PTS from the master. For M51 acceptance we still need twenty independently ground-truthed defects injected into *real* six-scene MP4+PCM material, ffprobe-vs-manifest timestamp checks for transitions and VFR, a version-aware triage/suppression journal with responsible human reviewers, blind A/B effect measurement, independent security/art review, canary and rollback.
- P05 assembly release pointer and P08 approved pointers are never modified by M51-R01. M51-C01–C08 remain open.

## M51-R02 — actionable issue triage (review-only)

The QC cockpit now prioritizes findings needing a human decision rather than
showing an undifferentiated list. Its default view is **attention required**;
users can choose all findings, untimed findings, or those already verified,
and optionally narrow results to one scene. Status, severity and issue-code
labels are provided in Russian, with the original machine code still visible
for troubleshooting. The count and empty state respond to filter changes.

- `FIXED` means awaiting independent confirmation, **not VERIFIED**.
  Unlocated technical P05 findings remain actionable, but never receive
  invented timestamps or a seek button.
- Video seek is attempted only after the source MP4 metadata has loaded, and
  only within measured MP4 duration; otherwise an actionable error is shown.
- On project change or rapid refresh, earlier in-flight responses are ignored
  using a request-generation guard; old project data is not painted over new.
- This view has **no** write API or release approval action. M58 offline
  speech/stereo QA results are **not** in M51's current P05/P07 service; UI
  must not pretend they are imported as trusted findings.

Verification: `node --test tests/cloud-qc-cockpit-triage.test.mjs`, existing
M51 service and wire tests, `npm run typecheck`, `npm run build`.
The added tests validate deterministic triage and presentation semantics plus
static UI safeguards; they are **not a browser-based accessibility or UX test**.
Existing P05 and P07 trust gates remain unchanged. This is not formal M51
acceptance, source rights proof, human QA, or a permission to publish.

### M51-R02 keyboard safeguards

When the read-only QC modal is open, global editor shortcuts such as Ctrl+Z,
Ctrl+Y and Ctrl+S must not mutate the underlying deck. Escape closes the modal
unless a video is in fullscreen mode, where Escape remains reserved for exiting
fullscreen. This is guarded by source-level regression tests; a real-browser
keyboard and screen-reader focus audit is still outstanding.
