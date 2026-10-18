## Purpose

Records when a club marks one of its upcoming matches as already shared with the team via WhatsApp, exposes that record to the Calendario page, and renders sent matches visually distinct so the user can see at a glance which matches they have already shared. Keeps the web-app self-contained: the same Next.js process owns the UI, the session, and the persistence — no second backend.

## ADDED Requirements

### Requirement: Match identity uses the upstream sidgad codes + date/time
The web-app's match parsers in `src/services/fmp.ts` and `src/services/fgp.ts` MUST extract `param_game[2]` and `param_game[3]` as `localCode` and `visitCode`, and `param_game[4]` as `gameId` (the sidgad competition id). When `param_game` is missing or malformed (fewer than five underscore-separated parts), all three MUST be `null`. The parsers MUST NOT throw.

#### Scenario: FGP row with a well-formed `param_game`
- **WHEN** a `tr.fila_agenda` element has `param_game="2_15_438_411_4853980"`
- **THEN** the parsed `Game` has `localCode: 438`, `visitCode: 411`, and `gameId: 4853980`

#### Scenario: Row with a missing `param_game` attribute
- **WHEN** a `tr.fila_agenda` element has no `param_game` attribute
- **THEN** the parsed `Game` has `localCode: null`, `visitCode: null`, `gameId: null`, and the parser does not throw; the row is still included in the response

### Requirement: A stable match key is derived for each match
The web-app MUST compute a stable string `matchKey` for every match before it reaches the Calendario UI. When `localCode` or `visitCode` is non-null, `matchKey` MUST be `"<competition>:<localCode>:<visitCode>:<date>:<time>"`. When both codes are null, `matchKey` MUST be a tuple-shaped fallback `"tuple:<competition>:<club_code>:<local>:<visit>:<date>:<time>"` whose text components are the existing `Game` fields uppercased, trimmed, and joined with a single colon separator.

#### Scenario: Match with upstream codes
- **WHEN** a match for FGP club 438 has `localCode: 438`, `visitCode: 411`, `date: "18/10/2026"`, `time: "18:30"`
- **THEN** the match's `matchKey` is the string `"FGP:438:411:18/10/2026:18:30"`

#### Scenario: Match without upstream codes
- **WHEN** a match for FGP club 438 has `localCode: null`, `visitCode: null`, `local: "HL NOROESTE"`, `visit: "RIVAL"`, `date: "18/10/2026"`, `time: "18:30"`
- **THEN** the match's `matchKey` is `"tuple:FGP:438:HL NOROESTE:RIVAL:18/10/2026:18:30"`

#### Scenario: Same match renders with the same key on a re-fetch
- **WHEN** the Calendario page is re-rendered after a reload and the same upstream row reappears
- **THEN** its `matchKey` is identical to the previously computed value for that match

### Requirement: Only ready matches can be marked sent
The system MUST only accept a "mark sent" request for a match that has both a `date` and a non-sentinel `time` (the same readiness rule used to render the "Enviar" button today). A row that is not ready MUST NOT be writable to the sent set, and its row in the Calendario MUST continue to render the pending treatment without an Enviar button or a sent marker.

#### Scenario: POST with a not-ready match key
- **WHEN** the client posts `{ matchKey: "..." }` for a match whose `date` is null or whose `time` is missing / sentinel (`00:00`, `--:--`)
- **THEN** the server responds with HTTP 400 and does not insert the row

#### Scenario: Pending row in the UI
- **WHEN** a match is rendered without `isMatchReady()` being true
- **THEN** the row shows the "Pendiente" badge, no Enviar button, and no sent marker

### Requirement: Sent matches are persisted server-side per club
The web-app MUST persist sent matches in a server-side store keyed by `(club_code, competition, match_key)`. The store MUST be isolated per club: a club MUST NOT be able to read or write another club's sent set. The system MUST record, at minimum, the `sent_at` timestamp in ISO 8601 UTC format.

The production store MUST be a remote libSQL database reachable via `SENT_STORE_URL` and authenticated with `SENT_STORE_AUTH_TOKEN`. The web-app MUST also accept the legacy Turso-integration names `SENT_STORE_TURSO_DATABASE_URL` (as a fallback for `SENT_STORE_URL`) and `SENT_STORE_TURSO_AUTH_TOKEN` (as a fallback for `SENT_STORE_AUTH_TOKEN`), so deployments that wire up Vercel's Turso integration without renaming the variables keep working. Local development MAY use a local SQLite file (`file:./data/sent.sqlite`) when neither `SENT_STORE_URL` nor `SENT_STORE_TURSO_DATABASE_URL` is set.

#### Scenario: First mark
- **WHEN** club 438 (FMP) sends a successful POST for `matchKey: "FMP:438:411:18/10/2026:18:30"`
- **THEN** the store contains one row with `club_code: 438`, `competition: "FMP"`, `match_key: "FMP:438:411:18/10/2026:18:30"`, `sent_at: <current ISO timestamp>`; a subsequent GET returns `{ sent: { "FMP:438:411:18/10/2026:18:30": "<that same timestamp>" } }`

#### Scenario: Second mark of the same match is idempotent
- **WHEN** the same club sends a second POST for `matchKey: "FMP:438:411:18/10/2026:18:30"` within the same minute
- **THEN** the store still contains exactly one row for that `(club, match_key)` and `sent_at` is the timestamp from the first mark; the second POST responds with HTTP 200 and that original `sent_at`

#### Scenario: Different clubs do not see each other's marks
- **WHEN** club 438 has marked `matchKey: "FMP:438:411:18/10/2026:18:30"` and club 411 requests its own sent set
- **THEN** the response for club 411 does not contain `"FMP:438:411:18/10/2026:18:30"`

#### Scenario: Unauthenticated request
- **WHEN** a request to `/api/matches/sent` arrives with no iron-session club
- **THEN** GET responds with HTTP 401 and POST responds with HTTP 401; no row is read or written

### Requirement: Marking a match as sent is triggered by clicking Enviar
When the user clicks the "Enviar" button on a ready match row in `MatchesBoard`, the system MUST attempt to open the WhatsApp deep-link (existing behaviour, unchanged) and MUST send a POST to `/api/matches/sent` carrying the row's `matchKey`. The UI MUST reflect the sent state optimistically — before the POST response — so the user sees the row flip immediately.

#### Scenario: Tap on Enviar
- **WHEN** the user clicks "Enviar" on a ready match
- **THEN** a WhatsApp tab opens AND a POST to `/api/matches/sent` is fired AND the row immediately renders as sent (no spinner, no waiting for the POST to return)

#### Scenario: POST fails after optimistic flip
- **WHEN** the POST fails (network error or 5xx) after the optimistic flip
- **THEN** the row remains visually marked sent for the current session and the sent set returned by the next page load is the source of truth

### Requirement: Sent matches render distinctly in the Calendario
For a ready match whose `matchKey` is in the current club's sent set, the Calendario row MUST render with:
- a non-interactive "✓ Enviado" pill that includes the localized sent-at date (e.g. `✓ Enviado · 14 oct`);
- a faded visual treatment (reduced text contrast) so the row reads as "already handled";
- an accent border (green) that distinguishes the row from unsent and pending rows;
- the "Enviar" button remains available so the user can re-share the match.

When the match is ready but NOT yet marked sent, the row MUST render exactly as today: the "Enviar" button is shown and no sent styling applies.

#### Scenario: Ready and sent
- **WHEN** the Calendario renders a match that is `isMatchReady()` and is in the sent set
- **THEN** the row shows a green accent border, faded text, a `✓ Enviado · <date>` pill, AND the "Enviar" button is still present

#### Scenario: Ready and not sent
- **WHEN** the Calendario renders a match that is `isMatchReady()` and is NOT in the sent set
- **THEN** the row shows the "Enviar" button and no sent styling

#### Scenario: Past matches do not render
- **WHEN** a match's date has passed
- **THEN** the Calendario does not render it (existing behaviour) — the sent marker for past matches is irrelevant and never displayed

### Requirement: The Calendario hydrates the sent set server-side
On a server-rendered request to `/calendario`, the page MUST read the current club's sent set and pass it to the component as a prop, alongside the matches. The first client paint MUST already reflect the sent state — there MUST NOT be a flash of unmarked rows that flip to marked after a client-side fetch.

#### Scenario: First paint with sent rows
- **WHEN** the user navigates to `/calendario` and has previously marked two matches as sent
- **THEN** the initial HTML contains those two rows in their sent visual state — no client-side GET to `/api/matches/sent` is required for the first paint

### Requirement: Sent state is hidden behind the iron-session auth
The `GET /api/matches/sent` and `POST /api/matches/sent` routes MUST reject any request whose iron-session does not resolve to a club. They MUST use `session.club.code` and `session.club.competition` as the namespace — never accept a club code or competition id from the request body or query string.

#### Scenario: Anonymous request
- **WHEN** a GET or POST to `/api/matches/sent` arrives with no session
- **THEN** the server returns HTTP 401 and the store is neither read nor written

#### Scenario: Body cannot spoof club
- **WHEN** club 411 (FMP) sends `POST /api/matches/sent` with body `{ matchKey: "FMP:99", clubCode: 438 }`
- **THEN** the row is written under club 411 (not 438); the `clubCode` field is ignored

### Requirement: Optimistic semantics are documented in the UI
The Calendario's existing `ShareInfoPanel` ("Cómo funciona Enviar") MUST explain that "Enviado" is recorded at the moment the user clicks Enviar and that the web-app has no way to confirm whether the message was actually sent from WhatsApp. The note MUST be brief (one sentence) and MUST NOT introduce a confirm/undo flow.

#### Scenario: Panel copy mentions the optimistic model
- **WHEN** the user expands the info panel
- **THEN** the panel text includes a one-sentence note that "Enviado" is marked when the user clicks Enviar, regardless of whether the message is actually sent from WhatsApp