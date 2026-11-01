# P21: color-lighting

## ADDED Requirements

### Requirement: Color-managed source transform
The system SHALL store source primaries, transfer, range, transform version and LUT SHA/license; convert deterministically into the declared delivery color space.

#### Scenario: Valid color-managed source transform
- **WHEN** two scenes have supported declared color profiles
- **THEN** the grade pipeline produces stable, comparable frames and logs source transformation

#### Scenario: Rejected or degraded color-managed source transform
- **WHEN** an unsupported profile, stale LUT SHA or incompatible color transform is supplied
- **THEN** the pipeline blocks automatic grading and leaves accepted originals untouched

### Requirement: Cross-scene exposure match
The system SHALL recommend bounded exposure, contrast and white-balance adjustments using evidence frames without forcing artistic uniformity.

#### Scenario: Valid cross-scene exposure match
- **WHEN** adjacent scenes have measurable luminance/color differences
- **THEN** the report offers reversible calibrated adjustments with cut-boundary comparisons

#### Scenario: Rejected or degraded cross-scene exposure match
- **WHEN** a reference frame lacks reliable color metadata or deliberately differs for narrative intent
- **THEN** the system returns REVIEW and allows a human to preserve creative contrast

### Requirement: Safety and rollout
The system SHALL check highlights/clipping, codec/color metadata, accessibility and regression versus the approved source.

#### Scenario: Valid safety and rollout
- **WHEN** the proposed grade is evaluated on real decoded frames
- **THEN** reversible grade and technical clipping reports are available

#### Scenario: Rejected or degraded safety and rollout
- **WHEN** the transform clips highlights beyond policy or causes a round-trip output mismatch
- **THEN** the build fails technical QA and keeps previous approved version
