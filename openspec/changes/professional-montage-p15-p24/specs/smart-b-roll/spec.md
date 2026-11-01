# P22: smart-b-roll

## ADDED Requirements

### Requirement: Rights-aware catalog only
The system SHALL select B-roll solely from assets with authorized catalog references, content SHA, provenance, permitted usage, rights owner and expiry metadata.

#### Scenario: Valid rights-aware catalog only
- **WHEN** a prompt maps to multiple assets in a user-authorized catalog
- **THEN** the proposal includes rights and exact source provenance for each candidate

#### Scenario: Rejected or degraded rights-aware catalog only
- **WHEN** an asset has unknown license, expired permission, ambiguous ownership or an external URL
- **THEN** the selector excludes it and records a rights failure without fetching it

### Requirement: Semantic and timing fit
The system SHALL rank relevant cutaways by narrative meaning, aspect ratio, duration, motion direction, continuity and negative constraints.

#### Scenario: Valid semantic and timing fit
- **WHEN** a reviewed story beat has usable catalog candidates
- **THEN** the director sees ranked alternatives and exact cut handles with rationale

#### Scenario: Rejected or degraded semantic and timing fit
- **WHEN** a B-roll clip hides required narration or breaks story continuity
- **THEN** the system rejects automatic placement and offers a safe alternative

### Requirement: Attribution, fingerprint and change control
The system SHALL preserve license/credit evidence, use source-pinned media and refuse publishing after asset permissions change.

#### Scenario: Valid attribution, fingerprint and change control
- **WHEN** a reviewer approves a B-roll slot with stable SHA and allowed-use metadata
- **THEN** the final EDL records the clip, attribution and reviewer decision

#### Scenario: Rejected or degraded attribution, fingerprint and change control
- **WHEN** license expiry, corrupted media or source SHA drift occurs before release
- **THEN** the assembly gate blocks the changed clip without deleting the last approved render
