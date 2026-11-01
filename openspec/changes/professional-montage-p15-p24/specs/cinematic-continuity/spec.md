# P17: cinematic-continuity

## ADDED Requirements

### Requirement: Entry and exit scene state
The system SHALL require versioned entry and exit descriptors for camera, motion vector, subject anchor, palette, lighting and audio tails before transition planning.

#### Scenario: Valid entry and exit scene state
- **WHEN** two approved scenes present bounded descriptors with consistent FPS and image geometry
- **THEN** the planner returns a deterministic compatibility assessment and exact evidence frame IDs

#### Scenario: Rejected or degraded entry and exit scene state
- **WHEN** a scene has missing or stale boundary descriptors
- **THEN** the transition is marked REVIEW rather than assumed visually continuous

### Requirement: Frame-safe cuts
The system SHALL represent hard-cut, match-on-action, J-cut and L-cut as explicit timeline operations with separately bounded audio/video trim windows.

#### Scenario: Valid frame-safe cuts
- **WHEN** the scene pair and sound sources have sufficient handles
- **THEN** the planner yields frame-accurate video and audio offsets without losing narration

#### Scenario: Rejected or degraded frame-safe cuts
- **WHEN** requested prelap, overlap or camera match needs samples outside the approved source
- **THEN** the operation fails closed and prior hard-cut release stays usable

### Requirement: Reviewer boundary compare
The system SHALL expose before/after previews and rationale at the precise joining frames; block delivery on a documented technical discontinuity.

#### Scenario: Valid reviewer boundary compare
- **WHEN** reference images at both cut boundaries are available
- **THEN** the reviewer can inspect a timecoded overlay and approve or reject the edit

#### Scenario: Rejected or degraded reviewer boundary compare
- **WHEN** the downstream scene changes after approval
- **THEN** the previous transition approval becomes stale and is not reused

## Verification constraints
- All scenarios are proposed behavior; no implementation is implied by this file.
- Tests MUST include timecoded media evidence, SHA-256 pinning and negative cases relevant to P17.
- Any subjective evaluation stays REVIEW until a real independent human signoff.
- See SDD user story P17, checkpoints P17-C01…P17-C06 and release gate in `specs/002-professional-montage/tasks.md`.
