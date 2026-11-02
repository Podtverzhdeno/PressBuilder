# Editorial-quality acceptance overlay — professional dynamic montage

**DRAFT / spec-only.** Applies as a quality floor to any M01–M60 / P15–P24 implementation. It does not rewrite per-feature requirements or authorize media publishing. **Professional ≠ maximal animation**. Quality is contextual, source-grounded and must be judged on the final master and human narrative comprehension.

## Quality dimensions and who owns decisions

| Dimension | Existing capability links | Observable or auditable criterion | Acceptance authority |
|---|---|---|---|
| Story, factual integrity | P10/P16/M03/M31/M39/M40 | Approved script/claims SHA, coherent information ordering, no unsupported assertions | Human editorial owner + proof ledger |
| Scene-to-scene continuity | P17/M06/M10/M29/M35 | Subject, action/direction, object position, color and eye-line transitions explainable | Technical model as REVIEW; human director decides |
| Dynamic pacing without fatigue | P15/M04/M09/M14/M17/M22 | Beat structure, dwell/reading time, nonmechanical variation, hard flash/jerk limits | Human A/B and technical safety gates |
| Typography and mobile layout | P20/M21/M26/M27/M55/M59 | Full Cyrillic glyph set, measured bounding boxes, fallback, safe margins, readable captions | Automated FAIL for clipping; human hierarchy/readability |
| Audio and speech | P09/P19/M11/M12/M13/M15/M18/M20/M52 | Real source-word map and sample-accurate time, intelligible speech under music, no clipping | Human listening plus technical PCM/EBU checks |
| Media rights and continuity | P22/M31/M32/M34 | Immutable asset hashes, license scope, duration, crop and transition permissions | Legal/authorized owner; absence blocks release |
| Effects, color, camera | P18/M21/M23/M24/M25/M28/M30/M53 | No unstable frame, illegal crop, excessive acceleration, uncontrolled flicker or gamut shift | Automated and independent artistic reviewer |
| Accessibility and safety | M21/M54/M55/M59 | Flash detection, reduced-motion mode, subtitle legibility, accessibility labels | Safety hard gate; owner override cannot waive violation |
| Reproducible export | P02/P05/P08/M01/M41/M42/M45/M47/M49/M58 | Exact source/input/toolchain SHA, rational PTS, stable master, previous release preserved | Machine QA + independent security/release review |

## The professional six-scene acceptance pack

A genuine acceptance pack SHALL contain **six individually versioned 3–7s authorized scenes**, intended script segments, mixed-media source manifest, timed captions, real speech and optional licensed music, font/shader references, one J/L or crossfade transition when feature requires it, and exactly scoped changes. Record *separate* negative fixtures (muted speech, 250ms voice shift, malformed audio frame, hidden Cyrillic glyph, flash burst, missing rights, stale source SHA). Never inject a defect in actual user content or alter approved releases.

**Test matrix:**

1. 24, 25, 30 FPS plus 24000/1001, 30000/1001 when relevant; explicit sample-rate 48kHz stereo; rational frame/timebase transforms. Record source and output PTS independently.
2. 1080p master H.264/AAC; 16:9, 9:16, 1:1 preview/reframe where a feature supports them. Proxy is never treated as master evidence.
3. Dark/light backgrounds, Cyrillic and Latin fallback, fast title entry, narrow mobile crop, contrast changes and font missing/fallback tests.
4. Continuous dialogue, interrupted voice, voice over music, real audio handles, clip boundary, gain automation, room tone, intentional speech pause and silence.
5. Motion from 2D text and 3D camera; mixed lengths, deliberate holds, tracked attention, jerk and flashing negative cases.
6. Real single-scene edit followed by incremental render and full-P05 control; corrupt cache and restart worker, compare approved output source and SHA.
7. Mask/generated/suggested media MUST carry rights/citation/license scope, otherwise only safe local synthetic preview allowed.
8. Independent human A/B on quality/story/pacing; technical FAIL and semantic factual inaccuracies override numerical similarity.

The fixture pack must be **legally usable** and independently reviewable. In its absence, requirements remain \`C05_BLOCKED_REAL_MEDIA\` and automated synthetic QC is a narrower accomplishment.

## Technical hard gates (proposed, must calibrate on owned baseline)

| Gate | Measurement | Proposed acceptance / failure logic |
|---|---|---|
| Media integrity | FFprobe + full decode + SHA | Missing required audio/video, corrupt frame or invalid checksum = FAIL |
| Timeline drift | Frames, samples, PTS | Exact acceptable range **must** be defined by delivery FPS/feature; source-known late 250ms cue = REVIEW/FAIL by contract, never auto-PASS |
| Speech content | Source-known word map + verified spoken track, human listening | Silence/dropout and intelligibility defect block release; sine/tone cannot certify speech |
| Loudness | EBU R128 integrated LUFS and true peak, per target platform | Record actual input/output and independent meter, calibrate policy to destination; avoid one arbitrary universal LUFS |
| Music ducking | Source-known speech/music stems and actual mix gain | Prevent masked voice and volume pumping; assess pauses and continuous bed, not just averaged RMS |
| Scene seams | Per-frame SSIM/VMAF where supported and human context | Black/corrupt frame is FAIL even if global mean similarity high; high SSIM doesn't prove artistic coherence |
| Flash safety | Time-coded actual luminance changes / motion | Unsafe flash severity blocks release; user-required reduced-motion setting enforced |
| Typography | Glyph coverage, bounding boxes, safe zones | Missing glyphs or clipping are technical FAIL; style quality remains editorial REVIEW |
| Transition timing | Exact frame/sample coordinates, phase, overlap | No accidental discontinuity or mismatch; intentional silence is not automatically a dropout |
| Provenance | Source media/fonts/audio, license + SHA | Unknown ownership = blocked real-media release even if render and CI are green |
| Reproducibility | Pinned renderer/image/FFmpeg/Chromium versions | Record variance and toolchain; no silent cache/version mixing |
| Rollback | P08/P05 immutable SHA before/after failure | SHA changes on a previously approved release = hard FAIL |

Thresholds above that require calibration are **not asserted as current passing measurements**.

## Editorial qualitative rubric (separate from CI)

Reviewers assess on matched blind A/B, each 1–5 ordinal rating, with explicit anchor descriptions:

- **Comprehension:** 1 = central message incomprehensible; 3 = mostly understandable with effort; 5 = user can accurately retell core claim after one view.
- **Rhythm and attention:** 1 = monotonous or disorienting; 3 = serviceable; 5 = deliberate pacing and clear emphasis without overload.
- **Visual hierarchy:** 1 = conflicting focus; 3 = text generally readable; 5 = immediate focus, guided gaze and consistent brand constraints.
- **Audio communication:** 1 = words masked, missing or harsh; 3 = generally clear; 5 = dialogue clear and music/subtle effects support it.
- **Transitions and continuity:** 1 = frequent abrupt errors; 3 = acceptable; 5 = creative transitions match the meaning of connected scenes.
- **Accessibility:** 1 = unsafe/unusable; 3 = basic support; 5 = effective reduced-motion/caption/mobile experience.

Record at least two independent reviewers if the feature claims an artistic uplift; counterbalance viewing order; publish sample size, rater disagreement, practical effect and baseline media rights. **Do not calculate a synthetic absolute “professional score”** or turn LLM confidence into a human decision. For a sample too small to claim a measured effect, status is inconclusive.

## Dynamic editing guardrails

- Motion only when it clarifies hierarchy, reveals information or strengthens semantic beat; avoid random camera movement as a success metric.
- Fixed templates SHALL provide variation but not violate brand contract, readability or user-approved text.
- Every effect has an editorial purpose, bounded compute budget, supported source frames and deterministic preview/master fallback policy.
- A cut or transition may be technically valid but contextually wrong; expose a timecoded reviewer card and reversible alternative rather than automatically replacing accepted content.
- Important claims, names, numbers and protected transcript text are immutable until an authorized editor approves a change; generative summaries or recuts cannot silently alter them.
- Maintain a source/timeline distinction: master, proxy, synthetic fixture and model-proposed corrections must be labeled separately in UI and receipts.

## End-to-end Definition of Done

A capability cannot claim production readiness before (1) bounded positive/negative tests, (2) exact source SHA and signed identity/scope, (3) licensed six-scene fixture with actual decoded media, (4) full CI and controlled media benchmark, (5) independent human/technical review, (6) staging fault and rollback, and (7) explicit owner approval for release. The original top-60 C01–C08 card is the authoritative checklist. This overlay does not mark it complete.

## Delivery intent

For the 30-day experiment, prioritize functional vertical slices and broken workflow repairs first. An unfinished advanced effect (e.g. generative video extension, full OTIO round-trip, expensive perceptual ML) remains a visible backlog item rather than being quickly approximated and called “done.” Thus speed is conditional on a genuinely better user workflow, not count of implemented effects.
