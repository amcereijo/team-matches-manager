## MODIFIED Requirements

### Requirement: Creating a link for the same target returns the same link

The system MUST identify a link's target by the owning club, the link kind and the target's own identity, and MUST treat a create request for an already-known target as a request for the existing link rather than a new one. Creating the same target twice MUST return the same hash and MUST NOT create a second row.

The target identity MUST be: for a team calendar, the competition, the club code, the squad name and the league that squad plays in; for a match, the competition, the club code, the fixture's date and the two team names. The fixture's kickoff time MUST NOT be part of the identity, so a fixture whose time is corrected keeps the same short URL.

A team-calendar link created without a league MUST keep the identity it had before leagues became part of a squad's identity, so the links a club already holds are reused rather than duplicated.

When an existing link is created again, the system MUST refresh the stored parameters, so a link always points at the current known state of its target.

A deactivated link MUST NOT be reused: creating a link for a target whose existing link was deactivated MUST produce a new hash, so a URL that was deliberately killed does not come back to life.

#### Scenario: The same squad yields the same link

- **WHEN** a club creates a link for `team_calendar` / squad `HL NOROESTE A` in `LIGA REGULAR SENIOR MASCULINA` twice
- **THEN** both responses carry the same hash, and the store holds exactly one row for that target

#### Scenario: The same name in two leagues yields two links

- **WHEN** a club creates a link for `team_calendar` / squad `DOMINICOS A` in `ALEVÍN GRUPO A`, and another for the same squad in `SENIOR MASCULINO`
- **THEN** the two links carry different hashes, because they point at two different teams

#### Scenario: A corrected kickoff keeps the same link

- **WHEN** a link was created for a fixture whose time was `18:00` and the federation later publishes `18:30`
- **THEN** creating the link again returns the same hash, and the stored parameters now carry `18:30`

#### Scenario: A deactivated link is not resurrected

- **WHEN** a club deactivates its link for squad `HL NOROESTE A` and then creates that link again
- **THEN** the new link has a different hash, and the deactivated row stays deactivated

### Requirement: A short link resolves to the existing canonical page

The system MUST support two link kinds. A `team_calendar` link MUST resolve to the canonical team calendar path `/t/<competition>/<club code>/<league>/<squad>`. A `match_calendar` link MUST resolve to the canonical single-match path `/c/<when>/<title>/<location>`, whose segments are exactly those the canonical calendar link uses.

The canonical path MUST be derived by the app from the stored parameters, using the same builders the rest of the app uses, so that a short link and the canonical URL always describe the same page. The client MUST NOT be able to supply a raw path or a raw target URL.

The canonical routes, their URLs, their pages and their own behaviour MUST NOT change because of this capability. A page MUST continue to be reachable by its canonical URL, with no session and with no short link involved.

#### Scenario: A team link resolves to the team calendar

- **WHEN** a `team_calendar` link for club `FGP-438` and squad `HL NOROESTE A` in `LIGA REGULAR SENIOR MASCULINA` is resolved
- **THEN** the response redirects to `/t/FGP/438/LIGA%20REGULAR%20SENIOR%20MASCULINA/HL%20NOROESTE%20A`

#### Scenario: A match link resolves to the single-match page

- **WHEN** a `match_calendar` link for the fixture `24/10/2026 17:00` against `RIVAL` is resolved
- **THEN** the response redirects to `/c/24%2F10%2F2026-17%3A00/Game%20with%20RIVAL`, with the same segments the canonical calendar link carries

#### Scenario: The canonical URL still works on its own

- **WHEN** a player opens `/t/FGP/438/LIGA%20REGULAR%20SENIOR%20MASCULINA/HL%20NOROESTE%20A` directly
- **THEN** the team calendar renders exactly as it does today, with no short link and no redirect involved

#### Scenario: A client cannot inject its own target

- **WHEN** a create request's body contains a field naming an arbitrary path or URL
- **THEN** the stored target is derived by the app from the kind's own parameters and that field is ignored

### Requirement: The /links page lists and manages the club's links

The app MUST provide a `/links` page, reachable from the app's navigation, that shows the signed-in club's short links.

For each link the page MUST show what the link points at, its short URL, and whether it is active. The page MUST let the club copy a link's short URL to the clipboard, deactivate an active link and re-activate a deactivated one.

The page MUST let the club create a team-calendar link by hand, choosing the squad the link points at. The squad MUST be chosen as a team and a league, because a team name alone does not identify a squad. The page MUST show the same set of links the management API returns for that club and no others.

The page MUST require a session: an anonymous request MUST be redirected to the login page, exactly like the other pages of the signed-in area.

#### Scenario: The list shows what each link points at

- **WHEN** the club opens `/links`
- **THEN** each of its links is listed with a description of its target (the squad and league for a team calendar, the fixture for a match), its short URL and its active state

#### Scenario: Copying a link

- **WHEN** the club activates the copy action on a link
- **THEN** the link's short URL is placed on the clipboard

#### Scenario: Deactivating from the page

- **WHEN** the club deactivates a link on the page
- **THEN** the link is shown as deactivated and the page reflects the new state without a reload

#### Scenario: Creating a team-calendar link by hand

- **WHEN** the club creates a link for the squad `HL NOROESTE A` in `LIGA REGULAR SENIOR MASCULINA` on the page
- **THEN** a new link for that squad and league appears in the list with its short URL

#### Scenario: The page needs a session

- **WHEN** an anonymous request arrives at `/links`
- **THEN** the request is redirected to the login page and no link is shown
