# P20: kinetic-typography

## ADDED Requirements

### Requirement: Word-level typography cues
The system SHALL bind emphasis, entry/hold/exit animation and text content to stable approved cue/word IDs without rewriting narration text.

#### Scenario: Valid word-level typography cues
- **WHEN** a cue contains verified word timestamps and the selected font exists
- **THEN** the renderer produces deterministic glyph animation with evidence frame timestamps

#### Scenario: Rejected or degraded word-level typography cues
- **WHEN** word timestamps are missing or text differs from the editor-approved script
- **THEN** automatic alignment is flagged REVIEW and the original text remains unmodified

### Requirement: Real glyph geometry
The system SHALL measure actual font fallback, ascenders/descenders, line breaks and safe-area bounds after text shaping.

#### Scenario: Valid real glyph geometry
- **WHEN** each rendered caption frame is inspected using the effective font
- **THEN** captions are legible, placed inside safe areas and do not overlap protected objects

#### Scenario: Rejected or degraded real glyph geometry
- **WHEN** a font is missing, glyphs are clipped or multiline text collides with another object
- **THEN** a timecoded geometry defect is reported and the export does not claim text-safe status

### Requirement: Readable and accessible motion
The system SHALL enforce minimum readable hold time, contrast policy and accessible reduced-motion subtitles.

#### Scenario: Valid readable and accessible motion
- **WHEN** the script includes long text or rapid word changes
- **THEN** the layout adapts to preserve meaning and reports unreadable candidates

#### Scenario: Rejected or degraded readable and accessible motion
- **WHEN** a user-defined visual effect violates the documented safe-area or readability policy
- **THEN** the system proposes a compliant alternative without silently discarding words
