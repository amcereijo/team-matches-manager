## Purpose

Lets a Calendario user narrow the visible list of upcoming fixtures to a subset of their own squads via a multi-select dropdown, with the selection remembered on the device so they do not have to re-set it on every visit.

## ADDED Requirements

### Requirement: Squad list is derived from the user's own teams in the agenda

The Calendario MUST compute the list of selectable squads from the fixtures in the user's upcoming agenda. A team name qualifies as a "user squad" if and only if it matches the authenticated club's name aliases (the same logic used to filter the agenda itself). The squad list MUST be the distinct set of such names across both the `local` and `visit` columns of the agenda, sorted in a stable order. Rivals MUST NOT appear as selectable options.

#### Scenario: Club with three squads and one opponent sees three filter options

- **WHEN** the authenticated club's upcoming agenda contains rows where the local or visit team is one of "CLUB X A", "CLUB X B", or "CLUB X JUNIOR" (with the opponent being some rival)
- **THEN** the Calendario's filter dropdown lists exactly "CLUB X A", "CLUB X B", and "CLUB X JUNIOR" as selectable squads, in that order, with no rival name in the list

#### Scenario: Single-squad club sees exactly one filter option

- **WHEN** the authenticated club only fields "CLUB X A" in the upstream agenda
- **THEN** the Calendario's filter dropdown lists exactly one squad option ("CLUB X A")

#### Scenario: Filter dropdown is hidden when no squads are derivable

- **WHEN** the user's agenda is empty or every row has neither `local` nor `visit` matching the user's club aliases (defensive edge case)
- **THEN** the Calendario MUST NOT render the filter dropdown and MUST render the agenda unchanged

### Requirement: Default selection is "Todos"

When the Calendario first renders and the persisted selection is missing, empty, or refers to squad names no longer present in the current squad list, the filter MUST behave as if "Todos" is selected: every agenda row is visible. The Calendario MUST NOT show an empty state solely because the user has not yet interacted with the filter.

#### Scenario: First visit on a new device shows every fixture

- **WHEN** the Calendario loads for a user with no stored selection
- **THEN** every fixture in the agenda is rendered and the header count equals the total number of fixtures

#### Scenario: Stored selection referencing a renamed squad falls back to "Todos"

- **WHEN** the persisted selection contains a squad name that no longer appears in the current agenda (e.g. the squad was renamed upstream or no longer has fixtures)
- **THEN** the Calendario ignores the stale name and treats the selection as "Todos" for the current render, without erasing the rest of the stored selection

### Requirement: Filter narrows visible fixtures to selected squads

A fixture is visible if and only if its `local` name OR its `visit` name is one of the currently selected squads. The "Todos" pseudo-selection is equivalent to selecting every squad. The filter MUST be applied purely as a UI render rule over the agenda returned by the server; the Calendario MUST NOT re-fetch the upstream agenda when the filter changes.

#### Scenario: Unchecking one squad hides its fixtures

- **WHEN** the user unchecks "CLUB X B" from a list that contains "CLUB X A", "CLUB X B", and "CLUB X JUNIOR"
- **THEN** the Calendario hides every row whose `local` or `visit` equals "CLUB X B" and keeps the rest

#### Scenario: Toggling the last unchecked squad returns to "Todos"

- **WHEN** the user unchecks the last remaining selected squad, leaving zero selected
- **THEN** the Calendario MUST behave as if "Todos" were selected and render every fixture

### Requirement: Header count reflects the filtered visible count

The Calendario header pill that displays the fixture count MUST show the number of fixtures currently rendered (post-filter), not the upstream total. When the filter is "Todos" the header count equals the upstream total; otherwise it equals the number of rows whose `local` or `visit` matches a selected squad.

#### Scenario: Header count drops when a squad is filtered out

- **WHEN** the agenda has 6 fixtures across 3 squads and the user selects only 1 squad which has 2 fixtures
- **THEN** the header shows "2 partidos" (singular form when count is 1) and 2 rows are rendered

#### Scenario: Header count uses singular form for one fixture

- **WHEN** the filter selects exactly one squad and the resulting visible count is 1
- **THEN** the header reads "1 partido" (singular) and one row is rendered

### Requirement: Selection is persisted on the device

The user's squad selection MUST be persisted on the device under a stable key and namespace. On subsequent visits from the same device and the same browser profile, the Calendario MUST read the stored selection and apply it before the first paint of the fixture list. The Calendario MUST NOT transmit the selection to the server, MUST NOT sync it across devices, and MUST tolerate a missing or unreadable storage value by falling back to "Todos".

#### Scenario: Reload preserves the selection

- **WHEN** the user selects "CLUB X A" and "CLUB X JUNIOR", then reloads the page
- **THEN** the Calendario opens with those same squads checked and renders only their fixtures

#### Scenario: Selection from a different browser profile is not applied

- **WHEN** a user opens the Calendario from a different browser or a private window where the storage namespace is empty
- **THEN** the Calendario MUST treat the selection as "Todos" and show every fixture

### Requirement: Storage is resilient to quota errors and corruption

Writes to device storage MUST be best-effort. A failure to write the selection (quota exceeded, storage disabled, private-mode quota zero) MUST NOT crash the Calendario or block the user from interacting with the filter; the in-memory selection for the current session MUST still work.

#### Scenario: Failed write does not block the filter UI

- **WHEN** writing the selection to device storage throws or rejects
- **THEN** the Calendario MUST keep rendering the filtered list for the current session and MUST NOT show an error dialog to the user

### Requirement: Filter is keyboard-accessible and screen-reader-friendly

The dropdown trigger and the checkbox list MUST be reachable and operable by keyboard. The trigger MUST announce its expanded/collapsed state, and each squad checkbox MUST have a programmatic label that includes the squad name. "Todos" MUST be a first-class selectable option at the top of the list (a single checkbox that toggles the whole selection on or off in one click).

#### Scenario: Keyboard user can open the dropdown and toggle a squad

- **WHEN** a keyboard user tabs to the filter trigger and presses Enter/Space
- **THEN** the dropdown expands, focus is reachable on each squad checkbox, and pressing Space on a checkbox toggles its selection without using the mouse