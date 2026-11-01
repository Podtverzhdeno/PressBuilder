# P23: creative-montage-qa

## ADDED Requirements

### Requirement: Separated severity semantics
The system SHALL mark hard technical invariants FAIL and subjective aesthetics REVIEW, never authoritatively PASS artistic excellence.

#### Scenario: Valid separated severity semantics
- **WHEN** QA detects missing narration, corrupt frames or invalid timebase
- **THEN** the affected release is blocked with exact technical rule and frame evidence

#### Scenario: Rejected or degraded separated severity semantics
- **WHEN** a model dislikes the pacing or style without an objective invariant
- **THEN** the note is REVIEW and cannot independently veto a human creative decision

### Requirement: Timecoded multi-modal evidence
The system SHALL produce bounded, versioned evidence for typography, movement, flashes, shot repetition, auditory balance, clipping and transition discontinuity.

#### Scenario: Valid timecoded multi-modal evidence
- **WHEN** a real MP4 with pinned source hashes is evaluated
- **THEN** each finding cites sample PTS, sampled frame/audio window, rule version and reproducible command/test

#### Scenario: Rejected or degraded timecoded multi-modal evidence
- **WHEN** a detector fails, returns nonfinite score or lacks enough representative samples
- **THEN** quality becomes UNKNOWN/REVIEW instead of an invented PASS

### Requirement: Calibration and reviewer signoff
The system SHALL compare new rules against baseline samples, publish false-positive/false-negative metrics and require independent reviewer decisions.

#### Scenario: Valid calibration and reviewer signoff
- **WHEN** the rule is evaluated against an agreed intentionally broken and clean fixture set
- **THEN** the test report includes precision/recall and threshold rationale

#### Scenario: Rejected or degraded calibration and reviewer signoff
- **WHEN** the rule causes systematic false positives on known valid sequences
- **THEN** it remains advisory and cannot become a production hard gate

## Verification constraints
- All scenarios are proposed behavior; no implementation is implied by this file.
- Tests MUST include timecoded media evidence, SHA-256 pinning and negative cases relevant to P23.
- Any subjective evaluation stays REVIEW until a real independent human signoff.
- See SDD user story P23, checkpoints P23-C01…P23-C06 and release gate in `specs/002-professional-montage/tasks.md`.
