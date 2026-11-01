# P16: creative-director

## ADDED Requirements

### Requirement: Narrative alternatives
The system SHALL propose at least two distinct, reasoned story beats (hook, exposition, demonstration, climax and payoff) from the approved script without removing factual claims.

#### Scenario: Valid narrative alternatives
- **WHEN** a six-scene script, audience profile and duration are supplied
- **THEN** a director receives alternative ordered beat sheets with source-text anchors and estimated durations

#### Scenario: Rejected or degraded narrative alternatives
- **WHEN** an agent cannot substantiate a claim or source-text anchor
- **THEN** the beat is flagged as an unresolved factual gap, not silently invented

### Requirement: Human story approval
The system SHALL require a reviewer-signed storyboard revision before scene briefs or approved scene order can change.

#### Scenario: Valid human story approval
- **WHEN** a director approves one story candidate with exact revision and actor identity
- **THEN** only its pinned revision becomes eligible for downstream agent work

#### Scenario: Rejected or degraded human story approval
- **WHEN** a worker or stale reviewer token attempts to approve, rewrite or publish a plan
- **THEN** the operation is rejected without changing previous approved story

### Requirement: Constrained replan
The system SHALL limit replan to affected scene IDs and preserve independent approved scenes, worker leases, source hashes and audit entries.

#### Scenario: Valid constrained replan
- **WHEN** a single scene fails a transition or continuity rule
- **THEN** the director proposes local alternatives and enumerates impacted downstream scenes

#### Scenario: Rejected or degraded constrained replan
- **WHEN** the replan modifies unrelated scene scripts or needs resource allowance beyond policy
- **THEN** the system refuses automatic edit and asks for human review
