# P18: professional-motion

## ADDED Requirements

### Requirement: Bounded animated properties
The system SHALL support deterministic keyframes for translation, rotation, scale, camera focal intent and interpolation with bounded easing curves.

#### Scenario: Valid bounded animated properties
- **WHEN** a valid motion contract is applied at fixed frame/tick indices
- **THEN** the same scene revision produces equivalent coordinates across preview and final render

#### Scenario: Rejected or degraded bounded animated properties
- **WHEN** a keyframe has NaN, huge acceleration, invalid order or impossible camera range
- **THEN** the contract is rejected before rendering without executing user scripts

### Requirement: Motion blur and speed ramp
The system SHALL cap blur samples, motion exposure, interpolation cost and speed ramps; preserve anchored speech unless the user explicitly changes audio timing.

#### Scenario: Valid motion blur and speed ramp
- **WHEN** the director authorizes a speed ramp for a visual-only clip
- **THEN** the resulting frames follow the ramp and the voice cue clock stays unchanged

#### Scenario: Rejected or degraded motion blur and speed ramp
- **WHEN** a ramp requires excessive samples, causes clipped handles or drifts protected narration
- **THEN** the renderer refuses or degrades to an explicit REVIEW-safe fallback

### Requirement: Performance and accessibility
The system SHALL provide per-scene motion budgets and an accessible low-motion fallback with reproducible CPU/render metrics.

#### Scenario: Valid performance and accessibility
- **WHEN** the clip exceeds a reviewed motion-intensity threshold
- **THEN** the low-motion alternative is available with the same narrative content

#### Scenario: Rejected or degraded performance and accessibility
- **WHEN** a worker attempts to disable the project motion cap or overwrite an approved version
- **THEN** permission enforcement denies the change and retains the accepted release
