# Short Links Specification

## Purpose

Lets a club publish short, opaque, app-owned URLs for the pages it shares with its players — instead of long canonical paths that spell out the club, the squad, the fixture and the venue — while keeping every link revocable, per-club isolated, and free of any third party between the player and the page. A link to a match lives exactly as long as the fixture it points at.

## Requirements

### Requirement: A short link is an opaque `/link/<hash>` URL

The system MUST expose a public route of the shape `/link/<hash>`, where `<hash>` is exactly 8 characters drawn from the Crockford base32 alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no `I`, `L`, `O` or `U`, so no character can be misread). The hash MUST be generated from a cryptographically secure random source, MUST NOT be derived from the club, the squad, the fixture or any other stored value, and MUST NOT be predictable from the catalogue of clubs and squads.

The absolute URL MUST be built from the app's public origin, following the same rule the existing calendar links use (`NEXT_PUBLIC_WEB_APP_URL` in production, `window.location.origin` in development).

The URL MUST NOT contain `&` or `?` characters, MUST NOT contain a raw space, and MUST survive being relayed through WhatsApp unchanged.

Looking a hash up MUST be case-insensitive: a recipient who retypes the link in lower case MUST reach the same page.

#### Scenario: The link's shape

- **WHEN** a club creates a short link
- **THEN** the URL is `<origin>/link/<8 characters>` and the 8 characters are all drawn from `0123456789ABCDEFGHJKMNPQRSTVWXYZ`

#### Scenario: The hash is not derived from the target

- **WHEN** a short link is created for the squad `HL NOROESTE A` of club `FGP-438`
- **THEN** the hash is not a deterministic function of the club code, the squad name or any other stored field, so knowing one link does not let anyone guess another

#### Scenario: The URL survives WhatsApp

- **WHEN** the URL is placed in a WhatsApp message
- **THEN** it contains no `&` or `?` characters and renders in the message preview as one contiguous link

#### Scenario: Lower-case hash still resolves

- **WHEN** a recipient opens `/link/7f3k9a2b` where the stored hash is `7F3K9A2B`
- **THEN** the route resolves it to the same page as `/link/7F3K9A2B`

#### Scenario: A hash outside the alphabet is not a link

- **WHEN** a request arrives for `/link/IL0OUUUU` or `/link/short`
- **THEN** the route responds with the not-available page and never touches the store

### Requirement: Links are stored per club and the club comes from the session

The system MUST persist short links in the server-side store, in a table separate from the sent-match store, holding at minimum: the hash, the owning club's code and competition, the link kind, the kind-specific parameters, the creation timestamp, and the moment the link was deactivated (empty while it is active).

The store MUST be isolated per club: a club MUST NOT be able to read, create, modify or disable another club's links.

The owning club MUST be taken from the authenticated session, never from the request body, the query string or any client-supplied field.

The production store MUST be the same remote libSQL database already configured through `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN` (with the legacy `SENT_STORE_TURSO_*` names still honoured as fallbacks). Local development MAY use the same local SQLite file already used for sent matches. The system MUST NOT require a second database, a second env var or a second credential.

#### Scenario: A link row records its owner

- **WHEN** club `FGP-438` creates a short link for kind `team_calendar`
- **THEN** the stored row carries `club_code: 438` and `competition: "FGP"` alongside the hash, the kind, the parameters and the creation timestamp

#### Scenario: The body cannot spoof the owner

- **WHEN** club `FMP-411` posts a create request whose body contains `"clubCode": 438`
- **THEN** the row is written under club 411 (competition `FMP`), and the `clubCode` field in the body is ignored

#### Scenario: One club cannot read another's links

- **WHEN** club `FMP-411` lists its links and club `FGP-438` has links stored
- **THEN** the response contains no link owned by club 438

#### Scenario: No new database is required

- **WHEN** the app is deployed with only `SENT_STORE_URL` and `SENT_STORE_AUTH_TOKEN` set
- **THEN** short links are persisted in that same database, and no additional env var is read

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

### Requirement: The resolver is anonymous, read-only and says nothing about the requester

The route that resolves a short link MUST NOT require a session, a cookie or an API key, and MUST respond to an anonymous request with the page the link points at — no redirect to login, no 401, no 403.

The route MUST be read-only and idempotent: resolving a link MUST NOT mutate any server-side state, and resolving the same link twice MUST produce the same result.

The route MUST NOT log, persist or otherwise capture the requester's IP address, user agent or any other identifying information. It MUST NOT contact any third-party service, so that no party other than the app and the player ever sees who opened the link.

The route MUST send cache headers that let a CDN and a phone's browser cache the resolution for a short period, so that a group of players tapping the same link does not produce one upstream fetch per tap.

#### Scenario: Anonymous resolution

- **WHEN** a request arrives for an active `/link/<hash>` with no cookies and no session
- **THEN** the route responds with a redirect to the canonical page — no redirect to login and no error status

#### Scenario: No requester is identified

- **WHEN** the route handles a request from an arbitrary IP and user agent
- **THEN** its implementation does not log or store the IP, the user agent or any other requester identifier

#### Scenario: Resolving does not mutate anything

- **WHEN** the same link is resolved twice
- **THEN** no stored row is written or changed by either resolution

#### Scenario: No third party is involved

- **WHEN** a link is resolved
- **THEN** the resolution is performed by the app alone; no external redirect service is contacted

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

### Requirement: The app resolves short links for the two kinds it shares and degrades gracefully

When the app composes a convocatoria it MUST ask the link store for a link for each kind it needs — the single match and the squad's team calendar — and use the short URLs it gets back.

If the store cannot be reached, or the request fails or times out, the app MUST compose the message with the canonical URLs instead and MUST still open the conversation. A failure in the link store MUST NOT stop the message from being sent, and MUST NOT surface an error to the club.

#### Scenario: Short links are used when the store answers

- **WHEN** the club shares a match and the link store answers with a link for the match and one for the squad
- **THEN** both links in the message are the short URLs

#### Scenario: The store is down and the message still goes out

- **WHEN** the link store cannot be reached while the club shares a match
- **THEN** the message is composed with the canonical `/c/...` and `/t/...` URLs and the conversation opens normally, with no error shown to the club
