## MODIFIED Requirements

### Requirement: Squad list is derived from the user's own teams in the agenda

The Calendario MUST compute the list of selectable squads from the fixtures in the user's upcoming agenda. A squad qualifies as a "user squad" if and only if one of the fixture's two sides belongs to the authenticated club: a side belongs to the club when the upstream club code of the fixture identifies it, or — as a fallback for fixtures that carry no usable code — when the side's name matches the club's name aliases (the same logic used to filter the agenda itself). Rivals MUST NOT appear as selectable options.

A squad MUST be identified by the pair (league, team name), not by the team name alone. The same club fields the same team name in several leagues — `DOMINICOS A` is in ALEVÍN GRUPO A, INFANTIL GRUPO B, JUVENIL GRUPO B and SENIOR MASCULINO — and each of those is a different team with its own fixtures. The squad list MUST therefore be the distinct set of such pairs across both the `local` and `visit` columns of the agenda, sorted by team name and then by league.

The option label MUST show the team name, and MUST append the league (`TEAM — LEAGUE`) whenever the same team name is used by more than one league of the club. A team name used by a single league MUST be shown on its own.

#### Scenario: Club with three squads and one opponent sees three filter options

- **WHEN** the authenticated club's upcoming agenda contains rows where the local or visit team is one of "CLUB X A", "CLUB X B", or "CLUB X JUNIOR" (with the opponent being some rival)
- **THEN** the Calendario's filter dropdown lists exactly "CLUB X A", "CLUB X B", and "CLUB X JUNIOR" as selectable squads, in that order, with no rival name in the list

#### Scenario: Single-squad club sees exactly one filter option

- **WHEN** the authenticated club only fields "CLUB X A" in the upstream agenda
- **THEN** the Calendario's filter dropdown lists exactly one squad option ("CLUB X A")

#### Scenario: Filter dropdown is hidden when no squads are derivable

- **WHEN** the user's agenda is empty or every row has neither `local` nor `visit` matching the user's club aliases (defensive edge case)
- **THEN** the Calendario MUST NOT render the filter dropdown and MUST render the agenda unchanged

#### Scenario: A club whose fixture names differ from its catalogue name still gets a filter

- **WHEN** the club is catalogued as "CLUB AA DOMINICOS" and the federation prints "DOMINICOS A" on the fixtures
- **THEN** the filter dropdown lists the club's squads derived from the upstream club code, instead of being empty

#### Scenario: Same team name in two leagues is listed twice, once per league

- **WHEN** the club fields "DOMINICOS A" in ALEVÍN GRUPO A and in SENIOR MASCULINO
- **THEN** the dropdown lists "DOMINICOS A — ALEVÍN GRUPO A" and "DOMINICOS A — SENIOR MASCULINO" as two separate options

#### Scenario: A team name used by one league is listed without the league

- **WHEN** the club fields "DOMINICOS D" only in ALEVÍN GRUPO D
- **THEN** the dropdown lists "DOMINICOS D", with no league appended

### Requirement: Default selection is "Todos"

When the Calendario first renders and the persisted selection is missing, empty, or refers to squad names no longer present in the current squad list, the filter MUST behave as if "Todos" is selected: every agenda row is visible. The Calendario MUST NOT show an empty state solely because the user has not yet interacted with the filter.

A persisted selection that names a squad of the current list MUST be applied, even when the persisted entry carries no league: in that case the entry MUST be resolved to the squad of that name when exactly one squad carries it, and MUST be dropped when several squads carry it, because choosing one of them would be a guess.

#### Scenario: First visit on a new device shows every fixture

- **WHEN** the Calendario loads for a user with no stored selection
- **THEN** every fixture in the agenda is rendered and the header count equals the total number of fixtures

#### Scenario: Stored selection referencing a renamed squad falls back to "Todos"

- **WHEN** the persisted selection contains a squad name that no longer appears in the current agenda (e.g. the squad was renamed upstream or no longer has fixtures)
- **THEN** the Calendario ignores the stale name and treats the selection as "Todos" for the current render, without erasing the rest of the stored selection

#### Scenario: A stored name that maps to a single squad is kept

- **WHEN** the persisted selection names "DOMINICOS D" and only one squad of the club carries that name
- **THEN** the Calendario applies that squad and renders only its fixtures

#### Scenario: A stored name that maps to several squads is dropped

- **WHEN** the persisted selection names "DOMINICOS A" and the club fields "DOMINICOS A" in several leagues
- **THEN** the Calendario drops that entry rather than guessing a league, and treats the selection as "Todos" when nothing else is stored

### Requirement: Filter narrows visible fixtures to selected squads

A fixture is visible if and only if its `local` name OR its `visit` name is one of the currently selected squads AND the fixture's league is the league of that squad. The "Todos" pseudo-selection is equivalent to selecting every squad. The filter MUST be applied purely as a UI render rule over the agenda returned by the server; the Calendario MUST NOT re-fetch the upstream agenda when the filter changes.

#### Scenario: Unchecking one squad hides its fixtures

- **WHEN** the user unchecks "CLUB X B" from a list that contains "CLUB X A", "CLUB X B", and "CLUB X JUNIOR"
- **THEN** the Calendario hides every row whose `local` or `visit` equals "CLUB X B" and keeps the rest

#### Scenario: Toggling the last unchecked squad returns to "Todos"

- **WHEN** the user unchecks the last remaining selected squad, leaving zero selected
- **THEN** the Calendario MUST behave as if "Todos" were selected and render every fixture

#### Scenario: Same name in another league stays visible

- **WHEN** the user selects "DOMINICOS A" of ALEVÍN GRUPO A and the agenda also contains "DOMINICOS A" of SENIOR MASCULINO
- **THEN** the Calendario hides the senior fixtures and keeps the ALEVÍN ones

### Requirement: Header count reflects the filtered visible count

The Calendario header pill that displays the fixture count MUST show the number of fixtures currently rendered (post-filter), not the upstream total. When the filter is "Todos" the header count equals the upstream total; otherwise it equals the number of rows whose `local` or `visit` matches a selected squad in that squad's league.

#### Scenario: Header count drops when a squad is filtered out

- **WHEN** the agenda has 6 fixtures across 3 squads and the user selects only 1 squad which has 2 fixtures
- **THEN** the header shows "2 partidos" (singular form when count is 1) and 2 rows are rendered

#### Scenario: Header count uses singular form for one fixture

- **WHEN** the filter selects exactly one squad and the resulting visible count is 1
- **THEN** the header reads "1 partido" (singular) and one row is rendered

### Requirement: Selection is persisted on the device

The user's squad selection MUST be persisted on the device under a stable key and namespace. The persisted selection MUST record the league of each selected squad, because the team name alone does not identify a squad. On subsequent visits from the same device and the same browser profile, the Calendario MUST read the stored selection and apply it before the first paint of the fixture list. The Calendario MUST NOT transmit the selection to the server, MUST NOT sync it across devices, and MUST tolerate a missing or unreadable storage value by falling back to "Todos".

#### Scenario: Reload preserves the selection

- **WHEN** the user selects "CLUB X A" and "CLUB X JUNIOR", then reloads the page
- **THEN** the Calendario opens with those same squads checked and renders only their fixtures

#### Scenario: The persisted selection remembers the league

- **WHEN** the user selects "DOMINICOS A" of ALEVÍN GRUPO A, reloads the page and opens the filter again
- **THEN** the option "DOMINICOS A — ALEVÍN GRUPO A" is still checked, and the senior "DOMINICOS A" is not

#### Scenario: Selection from a different browser profile is not applied

- **WHEN** a user opens the Calendario from a different browser or a private window where the storage namespace is empty
- **THEN** the Calendario MUST treat the selection as "Todos" and show every fixture
