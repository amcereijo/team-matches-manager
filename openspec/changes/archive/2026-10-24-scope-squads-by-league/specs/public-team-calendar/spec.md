## MODIFIED Requirements

### Requirement: The team calendar is addressed by competition, club code, and squad

The system MUST expose a public route of the shape `/t/<competition>/<code>/<league>/<squad>`, where each of the four path segments is percent-encoded independently. `<competition>` MUST be a competition identifier, `<code>` MUST be a numeric club code, `<league>` MUST be the league the squad plays in, and `<squad>` MUST be the squad's own name as it appears on the federation's fixtures (for example `HL NOROESTE A`).

The URL MUST NOT contain `&` or `?` characters, and MUST NOT contain a raw space, `/`, `?`, or `&` in any segment — the recipient receives this URL inside a WhatsApp message, where those characters cause the link to render as broken fragments.

`<competition>` and `<code>` MUST together identify a club that exists in the system's club catalogue. The route MUST NOT read a club or competition identity from any source other than these path segments — in particular, not from a session, cookie, query string, or request body.

The league MUST be part of the address because a team name does not identify a team: the same club fields the same team name in several leagues (`DOMINICOS A` is in ALEVÍN GRUPO A, INFANTIL GRUPO B, JUVENIL GRUPO B and SENIOR MASCULINO), and each of those is a separate team with a separate fixture list.

The route MUST also accept the three-segment shape `/t/<competition>/<code>/<squad>`, which was handed out before the league became part of the identity. A link of that shape MUST keep working and MUST resolve to the squad's fixtures across leagues.

#### Scenario: Squad-scoped URL for a club with multiple squads

- **WHEN** the squad name is `HL NOROESTE A`, the league is `LIGA REGULAR SENIOR MASCULINA`, the club is FGP code 438, and the squad's name in the catalogue is `HL NOROESTE`
- **THEN** the URL is `/t/FGP/438/LIGA%20REGULAR%20SENIOR%20MASCULINA/HL%20NOROESTE%20A` and the last segment carries the squad, not the club

#### Scenario: URL survives WhatsApp's line-wrapping

- **WHEN** the encoded URL exceeds 100 characters
- **THEN** it still contains no `&` or `?` characters, and renders in the WhatsApp message preview as one contiguous link

#### Scenario: Identity comes only from the path

- **WHEN** a request arrives with a valid session for a different club
- **THEN** the page resolves the club from the path segments and is unaffected by the session

#### Scenario: A link without a league still resolves

- **WHEN** a request arrives for `/t/FGP/438/HL%20NOROESTE%20A` — the shape handed out before the league became part of the address
- **THEN** the route responds with the squad's calendar instead of a 404

### Requirement: The page lists the squad's upcoming fixtures from live upstream data

On every request the route MUST read the current fixture data from the federation source and render only the fixtures belonging to the requested squad whose kickoff has not yet passed — the same set the club's own Calendario shows. Fixtures the federation has published without a confirmed kickoff time MUST be included and rendered with a "hora por confirmar" treatment. Fixtures that have already been played MUST NOT be rendered.

The squad MUST be identified by matching the fixture's local or visit team name against the resolved club's name aliases, using the same matching rule the Calendario and the rest of the app already use, so that a squad such as `HL NOROESTE A` is recognised as belonging to the club `HL NOROESTE`. Rivals MUST NOT appear in the list.

When the request carries a league, the page MUST list only the fixtures of that league. A fixture of the same squad in another league MUST NOT be rendered, even when the team name is identical — the two are different teams.

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

#### Scenario: Another league's fixtures are not listed

- **WHEN** the request carries the league `ALEVÍN GRUPO A` and the squad `DOMINICOS A` also plays in `SENIOR MASCULINO`
- **THEN** the page lists only the `ALEVÍN GRUPO A` fixtures of that squad, and none of the `SENIOR MASCULINO` ones

#### Scenario: The league is shown on the page

- **WHEN** the page renders for a squad with a league
- **THEN** the page names that league, so the reader can tell which team the list belongs to

### Requirement: Path segments survive being relayed through WhatsApp

The route MUST decode each path segment to its intended value regardless of how many times it has been percent-encoded before arriving. A link relayed through WhatsApp can arrive carrying an additional encoding layer, and decoding exactly once — and assuming the result is clean — is a known way to break an otherwise valid link.

After decoding, the route MUST normalise whitespace in the squad segment so that a mangled encoding that yields `+`, a doubled space, or a missing space between words still resolves to the intended squad name. The league segment MUST be normalised the same way. When a segment cannot be decoded at all, the route MUST fall back to treating it as a literal, unencoded value rather than failing the request.

#### Scenario: Doubly-encoded segment

- **WHEN** the squad segment arrives as `HL%2520NOROESTE%2520A` (encoded twice)
- **THEN** the route resolves the squad to `HL NOROESTE A` and renders its fixtures, not the not-ready error

#### Scenario: Malformed escape sequence

- **WHEN** a segment contains a bare `%` or an invalid escape such as `100% CP`
- **THEN** the route does not throw and does not respond with a server error; it treats the segment as a literal value and renders the empty state

#### Scenario: Whitespace mangled by the relay

- **WHEN** the relay turns the encoded space into `+` or doubles it
- **THEN** whitespace normalisation resolves the segment to the intended squad name
