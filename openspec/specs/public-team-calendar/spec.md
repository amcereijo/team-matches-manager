# Public Team Calendar Specification

## Purpose

Lets a player who received a convocatoria open a public web page and see their own squad's full list of upcoming fixtures, without logging in and without the organiser having to send a separate message per match.

## Requirements

### Requirement: The team calendar is addressed by competition, club code, and squad

The system MUST expose a public route of the shape `/t/<competition>/<code>/<squad>`, where each of the three path segments is percent-encoded independently. `<competition>` MUST be a competition identifier, `<code>` MUST be a numeric club code, and `<squad>` MUST be the squad's own name as it appears on the federation's fixtures (for example `HL NOROESTE A`).

The URL MUST NOT contain `&` or `?` characters, and MUST NOT contain a raw space, `/`, `?`, or `&` in any segment — the recipient receives this URL inside a WhatsApp message, where those characters cause the link to render as broken fragments.

`<competition>` and `<code>` MUST together identify a club that exists in the system's club catalogue. The route MUST NOT read a club or competition identity from any source other than these path segments — in particular, not from a session, cookie, query string, or request body.

#### Scenario: Squad-scoped URL for a club with multiple squads

- **WHEN** the squad name is `HL NOROESTE A`, the club is FGP code 438, and the squad's name in the catalogue is `HL NOROESTE`
- **THEN** the URL is `/t/FGP/438/HL%20NOROESTE%20A` and the `HL%20NOROESTE%20A` segment carries the squad, not the club

#### Scenario: URL survives WhatsApp's line-wrapping

- **WHEN** the encoded URL exceeds 100 characters
- **THEN** it still contains no `&` or `?` characters, and renders in the WhatsApp message preview as one contiguous link

#### Scenario: Identity comes only from the path

- **WHEN** a request arrives with a valid session for a different club
- **THEN** the page resolves the club from the path segments and is unaffected by the session

### Requirement: The page lists the squad's upcoming fixtures from live upstream data

On every request the route MUST read the current fixture data from the federation source and render only the fixtures belonging to the requested squad whose kickoff has not yet passed — the same set the club's own Calendario shows. Fixtures the federation has published without a confirmed kickoff time MUST be included and rendered with a "hora por confirmar" treatment. Fixtures that have already been played MUST NOT be rendered.

The squad MUST be identified by matching the fixture's local or visit team name against the resolved club's name aliases, using the same matching rule the Calendario and the rest of the app already use, so that a squad such as `HL NOROESTE A` is recognised as belonging to the club `HL NOROESTE`. Rivals MUST NOT appear in the list.

The page MUST NOT hard-code, snapshot, or embed fixture data. It MUST NOT persist the rendered fixture list for reuse by a later request.

#### Scenario: Squad with four upcoming fixtures

- **WHEN** the squad `HL NOROESTE A` has 4 upcoming fixtures and 6 played ones
- **THEN** the page lists exactly the 4 upcoming fixtures, in chronological order

#### Scenario: Pending fixture is listed

- **WHEN** one of the squad's upcoming fixtures has no confirmed kickoff time (sentinel or missing)
- **THEN** the page lists it with a "hora por confirmar" treatment rather than omitting it or inventing a time

#### Scenario: Squad does not field the rival

- **WHEN** the squad's fixtures include matches against a rival club
- **THEN** the rival never appears as one of the squad's own fixtures in the list

#### Scenario: Reloading reflects current upstream state

- **WHEN** the federation publishes a new fixture for the squad after the page was first requested
- **THEN** a later request reflects the new fixture rather than the previously rendered list

### Requirement: Unresolvable identity is a 404; unresolvable scope is an empty list

The route MUST respond with HTTP 404 when the competition segment is not a known competition, or when the club code is not in the club catalogue for that competition. In that case the response MUST be a plain Spanish page explaining that the link is not valid.

The route MUST respond with HTTP 200 and an empty-state message when the identity resolves but no upcoming fixture matches the requested squad. The route MUST NOT respond 404 merely because the squad matched nothing: the set of squad names is derived from fixture data and drifts over a season, so a squad name that resolves but matches nothing is a legitimate state and MUST NOT be presented as a broken link.

#### Scenario: Unknown competition

- **WHEN** a request arrives for `/t/XXX/438/NOROESTE%20A`
- **THEN** the route responds with HTTP 404 and a Spanish page explaining the link is not valid

#### Scenario: Unknown club code

- **WHEN** a request arrives for `/t/FGP/999/NOROESTE%20A` and no club 999 exists in FGP
- **THEN** the route responds with HTTP 404 and a Spanish page explaining the link is not valid

#### Scenario: Squad with nothing upcoming

- **WHEN** the club resolves but every fixture for the requested squad has already been played
- **THEN** the route responds with HTTP 200 showing an empty state such as "No hay partidos programados por ahora", and no list

#### Scenario: Hand-crafted squad name

- **WHEN** a request arrives for `/t/FGP/438/ANYTHING%20AT%20ALL`
- **THEN** the route responds with HTTP 200 and the empty state, not a 404 and not any other club's fixtures

### Requirement: The page is reachable without auth and exposes nothing about the requester

The route MUST NOT require any session, cookie, or API key. Anyone who can read the URL MUST be able to see the page — the URL is shared via WhatsApp to recipients who are not club admins. The route MUST be read-only and idempotent, and MUST NOT mutate any server-side state.

The route MUST NOT log, persist, or otherwise capture the recipient's IP address, user agent, or any other identifying information about the requester.

The page MUST NOT render the app's navigation chrome, MUST carry `<meta name="robots" content="noindex">`, and MUST render without any `<script>` tag and without any third-party or same-origin subresource request.

#### Scenario: Anonymous request

- **WHEN** a request arrives with no cookies, no `Authorization` header, and no session
- **THEN** the route responds with HTTP 200 and the page — no redirect to login, no 401, no 403

#### Scenario: Route does not log identifying information

- **WHEN** the route handles a request from an arbitrary IP and user agent
- **THEN** its implementation does not log the IP, the user agent, or any other requester identifier — the request is treated as a function of its path plus the upstream fixture data

#### Scenario: No script and no subresources

- **WHEN** the recipient inspects the page
- **THEN** the HTML contains no `<script>` tag, no `noindex`-defeating crawler directive, and requests no third-party or same-origin subresource

### Requirement: Cached responses disclose their freshness

The route MUST send cache headers that permit both the recipient's browser and the shared CDN to cache the page for a period measured in hours, and MUST permit a stale copy to be served while a fresh one is fetched in the background. A player who re-opens a link they received earlier MUST NOT incur an upstream fetch.

Because the response may be reused for hours, the rendered page MUST display the time at which its fixture data was retrieved. This timestamp MUST be generated when the page is rendered, so a cached page visibly ages rather than presenting stale data as current.

The route MUST NOT set a cache header that pins an individual fixture list indefinitely: the data MUST be refreshable without a redeploy.

#### Scenario: Second tap from the same phone

- **WHEN** the same player re-opens the same team link within the browser cache window
- **THEN** the page renders from the browser cache without an upstream fetch

#### Scenario: Many players tap the same link

- **WHEN** several players open the same team link inside the cache window
- **THEN** the page is served from the CDN and the federation is not contacted once per tap

#### Scenario: Page discloses its own age

- **WHEN** a page generated 3 hours ago is served from cache
- **THEN** the visible timestamp reads 3 hours ago, so the reader can tell the fixture list is not necessarily current

#### Scenario: Data refreshes without a redeploy

- **WHEN** the cache window has elapsed
- **THEN** the next request re-reads the upstream fixture data; no deploy or manual invalidation is required

### Requirement: Upstream failure degrades to a readable error, not a broken page

When the fixture source cannot be reached or fails to parse, the route MUST respond with a non-200 status and a plain Spanish page explaining that the calendar could not be loaded and suggesting the reader try again shortly. The route MUST NOT render a partially populated list, and MUST NOT leak an upstream error message, stack trace, or internal host to the reader.

#### Scenario: Federation source times out

- **WHEN** the upstream fixture source does not respond
- **THEN** the route responds with a non-200 status and a Spanish page saying the calendar could not be loaded, with no fixture rows and no internal error detail

#### Scenario: Source returns unparseable content

- **WHEN** the upstream source responds but contains no recognisable fixture rows
- **THEN** the route responds with the same explanatory error page rather than an empty list that implies "no matches scheduled"

### Requirement: Fixtures more than 15 days away are marked as provisional

Every fixture whose kickoff is more than 15 days from the current date MUST be rendered with a notice that the date is provisional and may still change. The notice MUST state that the federation can change the date until 15 days before the weekend the fixture falls in.

Whether a fixture's date is provisional MUST depend **only** on how far away it is. It MUST NOT depend on whether its kickoff time has been published: a fixture with a confirmed time can still be rescheduled to a different day, so a far-off fixture with a time still carries the notice.

The notice MUST be shown ONLY while the fixture is more than 15 days away. Once the current date reaches 15 days before the kickoff, the federation can no longer move it and the notice MUST be dropped — continuing to warn that a settled date "might change" would be false.

The "hora por confirmar" indicator is an **orthogonal** concern and MUST be governed separately: it reports that the kickoff time is missing, and applies regardless of distance. A far-off fixture may therefore carry both the time warning and the provisional notice; a fixture inside the 15-day window carries neither.

A fixture whose date cannot be parsed MUST carry the notice, because an unparseable date cannot be shown to be settled.

The threshold MUST be computed against the Europe/Madrid wall clock consistently with how kickoffs are parsed, so that a fixture landing on either side of a DST change is classified identically.

The notice MUST be visible without interaction — not hidden behind a tooltip, accordion or hover — because a player planning their weekend is exactly the reader who needs to know the date is not settled.

#### Scenario: Far-off fixture with a confirmed time still carries the notice

- **WHEN** a fixture has a published kickoff time but is more than 15 days away
- **THEN** the row shows the kickoff time AND the provisional notice

#### Scenario: Far-off fixture without a time carries both warnings

- **WHEN** a fixture has no confirmed kickoff time and is more than 15 days away
- **THEN** the row shows "hora por confirmar" AND the provisional notice

#### Scenario: Fixture inside the window drops the notice

- **WHEN** a fixture's kickoff is 15 days away or less, whether or not its time is confirmed
- **THEN** the row MUST NOT carry the provisional notice, and still carries "hora por confirmar" if its time is missing

#### Scenario: Exactly at the threshold

- **WHEN** the current date is exactly 15 days before the fixture's kickoff
- **THEN** the notice is NOT rendered; one millisecond earlier it would be

#### Scenario: Unparseable date stays provisional

- **WHEN** a fixture's date cannot be parsed
- **THEN** the row carries the provisional notice rather than assuming the date is settled

#### Scenario: Provisional rows offer no calendar action

- **WHEN** a fixture has no confirmed kickoff time
- **THEN** the row carries no add-to-calendar action, because an event cannot be created without a time

### Requirement: The add-to-calendar action is labelled "Añadir a calendario"

The page's add-to-calendar action MUST be labelled `Añadir a calendario`, and the page's closing hint MUST refer to the same wording. The label MUST be visible text, not only an `aria-label`.

#### Scenario: Button wording

- **WHEN** a confirmed fixture row renders
- **THEN** its action reads "Añadir a calendario" in the visible label and in the accessible name

#### Scenario: Closing hint matches the button

- **WHEN** the page renders its footer hint
- **THEN** the hint refers to "Añadir a calendario", matching the button wording exactly

### Requirement: Path segments survive being relayed through WhatsApp

The route MUST decode each path segment to its intended value regardless of how many times it has been percent-encoded before arriving. A link relayed through WhatsApp can arrive carrying an additional encoding layer, and decoding exactly once — and assuming the result is clean — is a known way to break an otherwise valid link.

After decoding, the route MUST normalise whitespace in the squad segment so that a mangled encoding that yields `+`, a doubled space, or a missing space between words still resolves to the intended squad name. When the squad segment cannot be decoded at all, the route MUST fall back to treating it as a literal, unencoded value rather than failing the request.

#### Scenario: Doubly-encoded segment

- **WHEN** the squad segment arrives as `HL%2520NOROESTE%2520A` (encoded twice)
- **THEN** the route resolves the squad to `HL NOROESTE A` and renders its fixtures, not the not-ready error

#### Scenario: Malformed escape sequence

- **WHEN** a segment contains a bare `%` or an invalid escape such as `100% CP`
- **THEN** the route does not throw and does not respond with a server error; it treats the segment as a literal value and renders the empty state

#### Scenario: Whitespace mangled by the relay

- **WHEN** the relay turns the encoded space into `+` or doubles it
- **THEN** whitespace normalisation resolves the segment to the intended squad name
