## ADDED Requirements

### Requirement: A match link is only usable up to its fixture's date

A `match_calendar` link MUST stop resolving once the fixture's own date is over. The comparison MUST be a calendar-day comparison in `Europe/Madrid`, so a link to a fixture played today MUST remain usable for the whole of that day — before the kickoff and after it — and MUST stop resolving once that day is over.

A `team_calendar` link MUST NOT expire. It names a squad rather than a fixture, so it has no date to expire on.

The expiry MUST be enforced by the resolver itself, so that it holds for every request that is not already cached by a browser or a CDN, whether or not anything has cleaned the store up.

A link MUST NOT be created for a fixture whose date is already past, because such a link would be unusable the moment it exists.

#### Scenario: The fixture's own day is still good

- **WHEN** a match link for the fixture `24/10/2026` is resolved on `24/10/2026`
- **THEN** the route redirects to the canonical page, whatever the time of day

#### Scenario: The day after is too late

- **WHEN** a match link for the fixture `24/10/2026` is resolved on `25/10/2026`
- **THEN** the route responds with the not-available page instead of redirecting

#### Scenario: The day is the club's own day

- **WHEN** the fixture's date is `24/10/2026` and it is `00:30` on `24/10/2026` in `Europe/Madrid`
- **THEN** the link is still usable

#### Scenario: A team link does not expire

- **WHEN** a team-calendar link is resolved long after the day it was created on
- **THEN** the route redirects to the team calendar

#### Scenario: A link for a date that is already past is refused

- **WHEN** a club creates a match link for the fixture `24/10/2026` on `26/10/2026`
- **THEN** the creation is refused and no link is stored for that target

### Requirement: Creating a link cleans up the links that are no longer valid

Before it stores anything, a create request MUST deactivate the expired match links the requesting club owns, so that the club's own list and the store's "at most one active link per target" rule both stay truthful.

The cleanup MUST be scoped to the requesting club: it MUST NOT deactivate another club's links. The correctness of the expiry itself MUST NOT depend on the cleanup — a link that was never cleaned up still stops resolving.

A link deactivated by the cleanup MUST NOT be handed out again: creating that target afterwards MUST produce a new hash, exactly as for a link the club deactivated by hand.

#### Scenario: Creating a link sweeps the club's expired match links

- **WHEN** club `FMP-411` owns an active match link for the fixture `24/10/2026` and creates a link on `26/10/2026`
- **THEN** the expired link is deactivated, and the newly created link is stored

#### Scenario: A link for today survives the sweep

- **WHEN** club `FMP-411` owns an active match link for the fixture `26/10/2026` and creates a link on `26/10/2026`
- **THEN** that link is still active afterwards

#### Scenario: Another club's links are left alone

- **WHEN** club `FMP-411` creates a link and club `FGP-438` owns an expired match link
- **THEN** the link owned by club 438 is not deactivated by that request

#### Scenario: A swept link is not handed out again

- **WHEN** a club's match link for a target is deactivated by the cleanup and the club creates that target again
- **THEN** the new link has a different hash, and the swept row stays deactivated

## MODIFIED Requirements

### Requirement: An unknown or deactivated link answers with a plain page

When the hash is unknown, malformed, belongs to a deactivated link, or names a match link whose date is over, the route MUST respond with HTTP 404 and a plain Spanish page explaining that the link is not available. It MUST NOT redirect anywhere, MUST NOT render a partially populated page, and MUST NOT leak an internal error, a stack trace or a store detail.

The page MUST NOT carry the app's navigation chrome, MUST carry `<meta name="robots" content="noindex">`, and MUST render without any `<script>` tag and without any third-party or same-origin subresource request, exactly like the other public pages of the app.

#### Scenario: Unknown hash

- **WHEN** a request arrives for `/link/ZZZZZZZZ`
- **THEN** the route responds with HTTP 404 and a Spanish page explaining the link is not available

#### Scenario: Deactivated link

- **WHEN** a club has deactivated a link and a player opens it
- **THEN** the route responds with HTTP 404 and the same explanatory page

#### Scenario: Expired match link

- **WHEN** a match link's fixture date is over and a player opens it
- **THEN** the route responds with HTTP 404 and the same explanatory page

#### Scenario: No internal detail leaks

- **WHEN** the not-available page renders
- **THEN** it names no table, no store, no club and no upstream host, and contains no script tag

### Requirement: Deactivating a link stops it from resolving

A club MUST be able to deactivate one of its links and to re-activate it. Deactivation MUST be recorded on the link's own row, so the history of what was shared stays visible to the club.

A deactivated link MUST NOT resolve to its target. The deactivation MUST take effect for every request that is not already cached by a browser or a CDN, and the maximum delay before a cached copy expires MUST be stated in the product's own documentation rather than left implicit.

A match link whose fixture date is over MUST NOT be re-activated: it would hand the club back a link that cannot resolve. The request MUST be refused with an answer that distinguishes this case from an unknown link.

#### Scenario: Deactivate then resolve

- **WHEN** a club deactivates a link and the link is opened afterwards
- **THEN** the route responds with the not-available page instead of redirecting to the target

#### Scenario: Re-activation restores the link

- **WHEN** a club re-activates a link that it had deactivated
- **THEN** the link resolves to its target again and carries no deactivation timestamp

#### Scenario: Re-activating an expired link is refused

- **WHEN** a club re-activates a match link whose fixture date is over
- **THEN** the request is refused with an answer distinct from the one given for an unknown link, and the link stays deactivated

#### Scenario: Another club cannot deactivate it

- **WHEN** club `FMP-411` sends a deactivate request for a link owned by club `FGP-438`
- **THEN** the link stays active and the request is refused

### Requirement: The management API is session-protected and scoped to the club

The app MUST expose a management API for short links. It MUST require an authenticated club session and MUST respond with HTTP 401 to any request without one.

Listing MUST return only the requesting club's links, each with its hash, its short URL, its kind, a human-readable description of what it points at, the canonical path it resolves to, its creation timestamp, its last update timestamp, whether it is active or deactivated, and whether it has expired.

Creating MUST accept one request or several, and MUST answer with the hash, the path and the absolute URL of each link it resolved or created. Creating MUST clean up the requesting club's expired match links before it stores anything, and MUST refuse a match link whose fixture date is already past.

Deactivating and re-activating MUST take a hash and MUST act only on a link owned by the requesting club. Re-activating a link whose fixture date is over MUST be refused with a status that distinguishes it from an unknown link.

#### Scenario: Listing returns the club's own links

- **WHEN** club `FGP-438` lists its links
- **THEN** the response contains each of its links with its kind, description, canonical path, timestamps, active state and expired state, and no link owned by any other club

#### Scenario: Anonymous access is refused

- **WHEN** a list, create, deactivate or re-activate request arrives with no session
- **THEN** the response status is 401 and no link is read, created or modified

#### Scenario: Creating several links in one call

- **WHEN** a create request carries two link requests — one team calendar and one match
- **THEN** the response carries one entry per request, each with its hash and absolute URL

#### Scenario: Deactivating someone else's link is refused

- **WHEN** club `FMP-411` deactivates a hash owned by club `FGP-438`
- **THEN** the link stays active for club 438 and the response reports the refusal

#### Scenario: Creating a link for a past date is refused

- **WHEN** a create request carries a match link for a fixture whose date is already past
- **THEN** the response status is 400, no link is stored for that target, and the reason is named in the response

### Requirement: The /links page lists and manages the club's links

The app MUST provide a `/links` page, reachable from the app's navigation, that shows the signed-in club's short links.

For each link the page MUST show what the link points at, its short URL, and whether it is active. The page MUST let the club copy a link's short URL to the clipboard, deactivate an active link and re-activate a deactivated one.

A match link whose fixture date is over MUST be shown as expired, and the page MUST NOT offer to re-activate it.

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

#### Scenario: An expired match link is shown as expired

- **WHEN** the club opens `/links` and one of its match links has a fixture date that is over
- **THEN** that link is shown as expired, and no re-activation action is offered for it

#### Scenario: Creating a team-calendar link by hand

- **WHEN** the club creates a link for the squad `HL NOROESTE A` in `LIGA REGULAR SENIOR MASCULINA` on the page
- **THEN** a new link for that squad and league appears in the list with its short URL

#### Scenario: The page needs a session

- **WHEN** an anonymous request arrives at `/links`
- **THEN** the request is redirected to the login page and no link is shown
