# P18 — Professional Motion: bounded deterministic preview core

P18-C01/C02 introduce a **data-only** motion planner. This is not a WebGL scene renderer or a production camera system.

## Input and behavior
- Declarative schema: `schemas/montage/professional-motion-v1.schema.json` and implementation `server/motion-engine.mjs`.
- Canonical rational frame rates: 24, 25, 30, 60, 24000/1001, 30000/1001; scene duration <= 60 seconds and <=1800 frames.
- 1–12 independent target/property tracks, <=32 keyframes per track and <=144 across all tracks; 2–120 sampled frames.
- Stable scene/target IDs, source SHA-256 and expected revision are inputs for later server-side verification; **not trusted merely because caller supplies them**.
- Properties: x/y/scale/rotation_rad/camera_yaw/camera_zoom/opacity/blur_px; linear, smoothstep or cubic-in-out easing.
- Rejects nonfinite/out-of-range values, duplicate target/property tracks, malformed keyframe order or coverage, excessive sampled velocity/acceleration, fast opacity changes that risk flashing.
- `reduced_motion:true` freezes spatial/camera/blur motion at its initial value, preserves permissible slow opacity fades.
- Deterministic samples at 0/25/50/75/100% by default, integer microsecond timing and SHA-256 on canonical validated request.

## Remaining work
- C03: permission-scoped MCP/REST and Studio keyframe editor with actual P08 version/scene CAS and reviewed manual overrides.
- C04: adversarial resource, malformed object, flicker, worker timeout and parallel-scene tests.
- C05: actual two-object Chromium/FFmpeg animations including **rendered** blur, frame comparisons, reduced-motion A/B with readable subtitles and real media QA.
- C06: staging canary, CPU/RAM/queue/latency observations, rollback and independent human signoff.
- The service does not persist, publish, re-render, or modify accepted MP4. `motion_blur_rendered:false` explicitly states lack of a physical blur renderer.

## Test plan
`node --test tests/cloud-motion-pro.test.mjs` tests deterministic 24 / 30000/1001 timebases, SHA/revision change, reduced motion, opacity fade, NaN, forbidden URL, invalid FPS, excessive samples/velocity/acceleration/flash and duplicate tracks. CI evidence is added to SDD only after observing the exact head run.
