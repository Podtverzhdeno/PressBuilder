# P19: sound-design

## ADDED Requirements

### Requirement: Versioned audio bus model
The system SHALL mix separately identified voice, music and SFX buses using source-pinned assets, channel mapping, trim/fade and approved rights metadata.

#### Scenario: Valid versioned audio bus model
- **WHEN** owned voice, licensed music and SFX assets are submitted
- **THEN** the mix report names all tracks, channel layouts, revisions and audible intervals

#### Scenario: Rejected or degraded versioned audio bus model
- **WHEN** a track is missing, unlicensed or references a remote URI not on the authorized allowlist
- **THEN** the mixer blocks publication and does not read arbitrary remote files

### Requirement: Ducking and loudness
The system SHALL provide deterministic speech-aware music ducking, configurable integrated loudness target, true-peak limits and listenable fades.

#### Scenario: Valid ducking and loudness
- **WHEN** narration overlaps the music bed in a nominated delivery profile
- **THEN** speech remains audible and the measured loudness/true peak are recorded from decoded output

#### Scenario: Rejected or degraded ducking and loudness
- **WHEN** the mix clips, loses narration, violates the delivery profile or analyzer cannot inspect audio
- **THEN** technical QA returns FAIL or explicit UNKNOWN instead of a fabricated pass

### Requirement: Audio/video sync and recovery
The system SHALL use the canonical rational timebase, compensate encoder delay and prevent cancellation from changing last approved mix.

#### Scenario: Valid audio/video sync and recovery
- **WHEN** a full six-scene edit includes J/L overlaps and one silent B-roll scene
- **THEN** decoded PTS and waveform checks show <= one output frame drift at agreed boundaries

#### Scenario: Rejected or degraded audio/video sync and recovery
- **WHEN** an export crashes halfway or changes the approved mix source SHA
- **THEN** new artifacts remain drafts and previous release pointer stays intact

## Verification constraints
- All scenarios are proposed behavior; no implementation is implied by this file.
- Tests MUST include timecoded media evidence, SHA-256 pinning and negative cases relevant to P19.
- Any subjective evaluation stays REVIEW until a real independent human signoff.
- See SDD user story P19, checkpoints P19-C01…P19-C06 and release gate in `specs/002-professional-montage/tasks.md`.
