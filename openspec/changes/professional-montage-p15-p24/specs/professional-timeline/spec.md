# P24: professional-timeline

## ADDED Requirements

### Requirement: Revisioned canonical edit graph
The system SHALL represent tracks, clip trims, effects, transitions, source references, rational PTS and undo/redo actions in a bounded immutable edit decision graph.

#### Scenario: Valid revisioned canonical edit graph
- **WHEN** an editor inserts or moves a clip under a current revision and scene lease
- **THEN** the result has stable IDs, reproducible timecodes and a new revision without mutating original media

#### Scenario: Rejected or degraded revisioned canonical edit graph
- **WHEN** a stale worker, cyclic dependency, overlapping exclusive track or out-of-range trim is provided
- **THEN** the edit fails closed with no partial timeline update

### Requirement: Interchange with loss report
The system SHALL export and import supported OpenTimelineIO/EDL subset using precise timebase, clip IDs and media relinking with a clear unsupported-effect report.

#### Scenario: Valid interchange with loss report
- **WHEN** the timeline uses supported tracks, transitions and plain clips
- **THEN** round-trip preserves cuts, duration and source references within one output-frame tolerance

#### Scenario: Rejected or degraded interchange with loss report
- **WHEN** a target format lacks a custom 3D effect, font or ducking envelope
- **THEN** export includes explicit loss warnings and never reports a lossless round-trip

### Requirement: Safe delivery and reproducibility
The system SHALL require approved timeline revision, pinned source hashes, human signoff and a reversible export archive.

#### Scenario: Valid safe delivery and reproducibility
- **WHEN** a reviewer approves an exact timeline revision and all scene versions
- **THEN** the final release and editable interchange include matching provenance manifest

#### Scenario: Rejected or degraded safe delivery and reproducibility
- **WHEN** the source media, approval status or timebase changes during export
- **THEN** publication is refused while the last accepted output remains readable

## Verification constraints
- All scenarios are proposed behavior; no implementation is implied by this file.
- Tests MUST include timecoded media evidence, SHA-256 pinning and negative cases relevant to P24.
- Any subjective evaluation stays REVIEW until a real independent human signoff.
- See SDD user story P24, checkpoints P24-C01…P24-C06 and release gate in `specs/002-professional-montage/tasks.md`.
