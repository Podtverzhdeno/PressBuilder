# P15: rhythm-engine

## ADDED Requirements

### Requirement: Aligned timebase
The system SHALL produce edit proposals on integer frames from version-pinned word timestamps, annotated speech pauses and optional licensed beat markers; each cut includes a reason and source revision.

#### Scenario: Valid aligned timebase
- **WHEN** an aligned narration and target rational FPS are available
- **THEN** each proposed cut has an integer frame, cue ID, confidence descriptor and source SHA

#### Scenario: Rejected or degraded aligned timebase
- **WHEN** audio has missing words, inconsistent timestamps or stale alignment revision
- **THEN** the analyzer returns REVIEW with missing evidence and does not invent exact cuts

### Requirement: Pacing constraints
The system SHALL honor editor-defined minimum shot length, intended reading duration, maximum cuts per interval, protected narration spans and manual overrides.

#### Scenario: Valid pacing constraints
- **WHEN** an agent suggests a quick cut sequence under a reviewed pacing policy
- **THEN** all cuts obey constraints, keeping protected phrase spans intact

#### Scenario: Rejected or degraded pacing constraints
- **WHEN** a beat proposal would cut through a protected word or shorten a subtitle below its readable duration
- **THEN** the cut is blocked or flagged REVIEW with exact frames and violated rule

### Requirement: Determinism and review
The system SHALL persist candidate rhythm plans with source hashes and explicit human approval, and never modify deck.json or accepted releases on proposal.

#### Scenario: Valid determinism and review
- **WHEN** the same alignment, music markers and policy are provided twice
- **THEN** both preview plans and cut IDs are byte-identical

#### Scenario: Rejected or degraded determinism and review
- **WHEN** the soundtrack, cue positions or policy changes after an approved plan
- **THEN** the old plan is invalidated and no release is overwritten

## Verification constraints
- All scenarios are proposed behavior; no implementation is implied by this file.
- Tests MUST include timecoded media evidence, SHA-256 pinning and negative cases relevant to P15.
- Any subjective evaluation stays REVIEW until a real independent human signoff.
- See SDD user story P15, checkpoints P15-C01…P15-C06 and release gate in `specs/002-professional-montage/tasks.md`.
