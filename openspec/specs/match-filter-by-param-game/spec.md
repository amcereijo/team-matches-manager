## Purpose

Defines how the web-app filters the matches returned by the sidgad upstream so that the Calendario and home page show the rows that actually involve the requested club, even when the upstream's cell text doesn't match the catalogue's club name exactly.

## Requirements

### Requirement: Match filtering uses `param_game` codes as the primary signal
The web-app's match parser MUST extract `param_game[2]` and `param_game[3]` (the local and visit club codes) from each `tr.fila_agenda` row and surface them on the `Game` shape as `localCode` and `visitCode` (both `number | null`). When `getMatchesForClub(clubCode)` filters the parsed matches for a club, a row MUST be kept if `m.localCode === club.code` OR `m.visitCode === club.code`.

#### Scenario: FGP club with rows that have `param_game` codes
- **WHEN** the user requests matches for FGP club 438 (HL NOROESTE) and the snapshot contains rows whose `param_game` references code 438 even when the cell text does not contain the string "HL NOROESTE"
- **THEN** `getMatchesForClub(438)` returns those rows in `matches`

#### Scenario: Unknown upstream that omits `param_game`
- **WHEN** a row has no `param_game` attribute (or a malformed value) so `localCode` / `visitCode` are `null`
- **THEN** the row is still parseable and may be kept by the name-based fallback

### Requirement: Name-based alias match remains a fallback
When the code-based match in the previous requirement does not keep a row, the system MUST also keep the row if the existing alias-based name match (the suffix-stripping `isClubMatch` helper) returns `true` for `m.local` or `m.visit`. Either match is sufficient; both checks run for every row.

#### Scenario: FMP club whose cell text exactly matches the catalogue
- **WHEN** the user requests matches for FMP club 411 (TISO PATIN) and the snapshot's cell text for those rows is exactly `TISO PATIN`
- **THEN** `getMatchesForClub(411)` keeps the rows via either the code path (primary) or the name path (fallback); the resulting `matches` array is identical to the pre-change behaviour

#### Scenario: FGP club whose cell text uses a different label than the catalogue
- **WHEN** the user requests matches for FGP club 415 (catalogue name `CD MASTERS HL`) and the snapshot's cell text uses `MASTERS HOCKEY LIÑA` for that code
- **THEN** the code-based match (`localCode === 415` or `visitCode === 415`) keeps the row; the name match would miss it

### Requirement: Defensive parsing of `param_game`
The system MUST treat a missing or malformed `param_game` attribute as a non-fatal condition. `localCode` and `visitCode` MUST be `null` in that case. The parser MUST NOT throw, and the row MUST still appear in the response (so the team/field catalogue and any client rendering keeps working).

#### Scenario: Row with a missing `param_game` attribute
- **WHEN** a `tr.fila_agenda` element has no `param_game` attribute
- **THEN** the parsed `Game` has `localCode: null` and `visitCode: null`, and the row is still included in the upstream `matches` array; the team/field catalogue accumulates the cell text as before

#### Scenario: Row with a `param_game` of fewer than 4 underscore-separated parts
- **WHEN** a `param_game` value is `1_7_147` (only 3 segments)
- **THEN** the parser sets `localCode: null`, `visitCode: null` and does not throw; the row is still emitted