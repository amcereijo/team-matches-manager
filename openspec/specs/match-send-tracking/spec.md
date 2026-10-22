# Match Send Tracking Specification

## Purpose

Records when a club marks one of its upcoming matches as already shared with the team via WhatsApp, exposes that record to the Calendario page, and renders sent matches visually distinct so the user can see at a glance which matches they have already shared. Keeps the web-app self-contained: the same Next.js process owns the UI, the session, and the persistence — no second backend.

## Requirements

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

### Requirement: Convocatoria includes a one-tap "Add to calendar" link for ready matches

> **Name note.** The header keeps its original wording so the requirement is matched to the existing one at archive time. This change **adds a second link alongside** the existing one — it does not replace it.

When the Calendario builds the WhatsApp convocatoria text for a match, the text MUST contain the line `📅 Añadir al calendario:` followed by the single-match landing-page URL, in its existing slot: after the fixture facts block (kickoff, venue, map link) and before the `Porteros:` roster scaffold, on its own line. This line MUST be emitted **only for ready matches** (those with both a date and a confirmed kickoff time), exactly as today.

The text MUST additionally contain a second line, `📅 Calendario del equipo:` followed by the public team calendar URL `/t/<competition>/<clubCode>/<squad>`, separated from the add-to-calendar block by a blank line and from the `Porteros:` block by a blank line. The two links serve different intents and both MUST be present:

- **Add to calendar** — the one-tap action for *this* fixture, on the stateless single-match page.
- **Team calendar** — the standing reference to *the squad's full upcoming schedule*, on the live page.

The `<squad>` MUST be the squad the convocatoria is for: the side of the fixture belonging to the user's own club. Determining that side MUST use the upstream `param_game` club codes as well as the club's name aliases, because the federation's squad names do not reliably derive from the catalogue's club names (`ALAMEDA DE OSUNA A` is club 386's `ALAMEDA OSUNA HP`). A name-alias-only test matches neither side of such a fixture and produces a link scoped to the rival. If `local` belongs to the club the squad is `local`; if `visit` does, the squad is `visit`. If neither side can be identified, the team-calendar line MUST be omitted and the rest of the message MUST be unchanged.

The team-calendar line MUST NOT be gated on match readiness: the squad name is readable off any fixture, so the line is derivable for a pending match too. The Calendario's "Enviar" control continues to render only for matches with a confirmed date and time, which is unchanged and out of scope.

Each URL segment MUST be encoded with `encodeURIComponent`. Neither URL may contain any `&` or `?` characters, which would cause WhatsApp to wrap the link into unclickable fragments.

`<WEB_APP_BASE_URL>` — the public origin of the deployed web-app — MUST be read from the `NEXT_PUBLIC_WEB_APP_URL` env var in production builds, falling back to `window.location.origin` in development, for **both** URLs.

Two mechanisms were evaluated and rejected before landing on Google Calendar, and remain rejected for the per-match "Añadir a calendario" action:

- **iCalendar (`.ics`)** — pointing an `https://` link at a `text/calendar` payload makes Android and iOS **download the file** rather than hand it to the calendar app, adding a download-notification or file-manager step. Rejected: the user does not want a file download.
- **`webcal://`** — Android and iOS both register it with calendar apps, but the scheme is not universally honoured and was inert in Chrome on Android. Rejected: the mechanism does not work reliably.

Both public pages therefore offer **Google Calendar**, reached by tapping a button on the page rather than by putting a Google URL in the message: a `calendar.google.com/...?a=1&b=2…` URL is long and full of `&` separators, which WhatsApp wraps mid-token.

#### Scenario: Ready match, local is "us"

- **WHEN** the Calendario builds the convocatoria for a ready match between club FGP 438 (catalogue name `HL NOROESTE`) and `RIVAL`, where the fixture's squad is `HL NOROESTE A`
- **THEN** the text contains `📅 Añadir al calendario:` with the `/c/…` URL, then a blank line, then `📅 Calendario del equipo:` with `/t/FGP/438/HL%20NOROESTE%20A`, then a blank line, then `Porteros:`

#### Scenario: Squad is taken from the visit side

- **WHEN** `local` is a rival and `visit` belongs to the user's club
- **THEN** the team-calendar URL's squad segment is the `visit` name, and the `/c` title names the `local` side as the opponent

#### Scenario: Club code decides which side is ours when the names diverge

- **WHEN** the club's catalogue name is `ALAMEDA OSUNA HP` (code 386) and the fixture is `ALAMEDA DE OSUNA A` vs `CDE EL CASAR A`, so neither side matches the name aliases
- **THEN** the team-calendar URL's squad segment is `ALAMEDA%20DE%20OSUNA%20A` — identified via the `param_game` code — and NOT the rival `CDE%20EL%20CASAR%20A`

#### Scenario: Away fixture names the right opponent

- **WHEN** the fixture is `COSLADA RH A` vs `ALAMEDA DE OSUNA A` for club 386
- **THEN** the `/c` title is `Game with COSLADA RH A`, never `Game with ALAMEDA DE OSUNA A`

#### Scenario: Squad-scope prevents cross-squad leakage

- **WHEN** the club fields both `HL NOROESTE A` and `HL NOROESTE B` and the convocatoria is for a `NOROESTE A` fixture
- **THEN** the URL's squad segment is `HL%20NOROESTE%20A`, so the linked page lists only that squad's fixtures

#### Scenario: Pending match — line is omitted

- **WHEN** the match's `time` is `--:--` or missing
- **THEN** the `📅 Añadir al calendario:` line is omitted entirely (unchanged behaviour) while the `📅 Calendario del equipo:` line is still derivable, because the squad name is readable off a fixture regardless of whether the kickoff is confirmed

#### Scenario: WhatsApp preview shows the URL unbroken

- **WHEN** either URL exceeds 100 chars after URL-encoding
- **THEN** neither contains `&` or `?` characters, and both render as single contiguous links in the WhatsApp message preview

#### Scenario: Roster scaffold is unchanged

- **WHEN** the convocatoria is built for any match
- **THEN** the `Porteros:` / `Delegado:` / `Anotador:` / `No puede:` block is byte-for-byte identical to its current form

#### Scenario: Neither side is the user's club

- **WHEN** neither side can be identified as the user's club by code or alias
- **THEN** the `📅 Calendario del equipo:` line is omitted and the rest of the message is unchanged

#### Scenario: Production build uses the env var

- **WHEN** `NEXT_PUBLIC_WEB_APP_URL=https://team-matches-manager.vercel.app` is set at build time
- **THEN** both URLs' origins are `https://team-matches-manager.vercel.app`, regardless of `window.location.origin`

#### Scenario: Local development falls back to window.location.origin

- **WHEN** `NEXT_PUBLIC_WEB_APP_URL` is NOT set and the Calendario runs in a browser
- **THEN** both URLs' origins are `window.location.origin`

#### Scenario: Ready match with no map URL

- **WHEN** the Calendario builds the convocatoria for a match whose `location` is `Pabellón X` and whose `map` is null
- **THEN** the `/c` URL carries the venue without a trailing map reference and with no empty parentheses

### Requirement: The single-match landing page is retained alongside the team calendar

The `/c/[...]` single-match landing page MUST remain present, reachable without authentication, and behaviourally unchanged after the team calendar link is added to the same message. It MUST NOT be removed, redirected, or repurposed.

The page's existing requirements — the standalone HTML contract, the Google Calendar button shape, the not-ready kickoff rejection, and the no-auth reachability guarantee — continue to apply unchanged.

The two public pages have deliberately different failure profiles and both MUST continue to exist: `/c` performs no upstream I/O and cannot fail, whereas the team calendar page reads live upstream data and can be stale or unavailable. `/c` is the message's primary calendar link and the only page that still works when the federation is unreachable.

#### Scenario: A link sent before this change still works

- **WHEN** a recipient opens a `/c/[...]` link that was sent in a convocatoria before this change
- **THEN** the page renders exactly as it does today, with its calendar button, and without any redirect

#### Scenario: Route remains anonymous

- **WHEN** a request to `/c/[...]` arrives with no session
- **THEN** it responds with the landing page — retaining this route introduces no auth requirement

#### Scenario: Team calendar failure does not affect `/c`

- **WHEN** the team calendar page cannot reach the fixture source
- **THEN** it renders its own explanatory error; the `/c` page is not modified, redirected, or relied upon

### Requirement: Calendar landing page

The `/c/[...]` route MUST respond with a standalone HTML page that:

- Renders the match title (from the title-slug segment) as the page heading.
- Renders the kickoff as a human-readable Spanish date and time (e.g. `sábado, 24 de octubre, 17:00`), derived from the date/time segments. The page MUST render this text server-side so it is present in the initial HTML without JavaScript.
- Renders the venue (from the location-slug segment) when present, and a `Cómo llegar` link to the map URL when the location segment carries one.
- Renders ONE prominent link styled as a button, labelled `📆 Añadir al calendario`, whose `href` is a Google Calendar "add event" URL (see *Google Calendar link* below). The link MUST use `target="_blank"` and `rel="noopener noreferrer"`.
- MUST NOT render any `.ics` download link, any `webcal://` link, or any other download affordance.
- MUST NOT require the recipient to be logged in, MUST NOT show the app's navigation chrome, MUST carry `<meta name="robots" content="noindex">`, and MUST render without any script tag and without any third-party or same-origin subresource request.
- MUST escape all user-derived text (title, date, venue, map URL) for HTML — these values come from a scraped upstream feed and are not guaranteed to be free of `<`, `>`, or `"`.

The page MUST be readable on a phone in both light and dark system appearance, and MUST be usable with a viewport narrower than 420px without horizontal scrolling.

#### Scenario: Recipient taps the link on Android

- **WHEN** a recipient taps the link in WhatsApp and Android opens the default browser
- **THEN** the browser renders the landing page showing the match title, the kickoff as a Spanish date and time, the venue with a `Cómo llegar` link, and one `📆 Añadir al calendario` button

#### Scenario: Tapping the button opens Google Calendar

- **WHEN** the recipient taps the `📆 Añadir al calendario` button
- **THEN** Google Calendar opens with the event-creation form prefilled — no file is downloaded, no file manager is involved, and no intermediary download notification appears

#### Scenario: No download affordance anywhere on the page

- **WHEN** the recipient inspects the landing page
- **THEN** the HTML contains no `.ics` href, no `download` attribute, no `webcal://` URL, and no `<script>` tag

#### Scenario: Echoed paths are re-encoded

- **WHEN** the route renders the landing page
- **THEN** any path the page echoes back is built by re-encoding each segment with `encodeURIComponent`, so it contains no raw space, `/`, or `?`. Next.js hands `params.path` to the handler already URL-decoded, so echoing it verbatim would produce a malformed URL.

### Requirement: Google Calendar link

The landing page's button `href` MUST be a Google Calendar event-creation URL built as:

```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=<title>&dates=<start>/<end>&ctz=Europe/Madrid&details=<fixed note>&location=<location>
```

Each parameter MUST be encoded with `encodeURIComponent` individually, so the `&` separators stay unescaped. `location` is omitted when the match has no venue.

This template is pinned to a shape confirmed working by hand. Three details look redundant or wrong at a glance and MUST NOT be "cleaned up", because each one was arrived at by breaking it on a real device:

**The path is `/calendar/render` — no `r/`.** Google's documentation also advertises `/calendar/r/eventedit`, but the Google Calendar **Android app** registers no App Link handler for `eventedit` and drops the query string: the Calendar app opens on the day view with nothing to save. `/calendar/render` reaches the editor on Android.

**`dates` is a pair of real UTC instants with `Z` on BOTH halves — not the Madrid wall clock.** Shipping the wall-clock digits instead makes the editor open with no date and nothing to save. Google's parser only treats the range as UTC when both halves carry `Z`.

**`ctz=Europe/Madrid` is present even though `dates` is already UTC.** The `Z` fixes the instant; `ctz` declares which zone the event conceptually belongs to, which is what makes a Spanish fixture display at the intended hour. Removing it is a documented temptation and a regression — it was briefly removed on the theory that it conflicted with the UTC pair, which was wrong: Google accepts and preserves both together.

- `action` — fixed `TEMPLATE`.
- `text` — the event title, governed by *Event title rule*.
- `dates` — `<start>/<end>`, both `YYYYMMDDTHHMMSSZ` real UTC instants, start = kickoff and end = kickoff + 90 minutes.
- `ctz` — fixed `Europe/Madrid`.
- `details` — the fixed string `Convocatoria enviada por WhatsApp`.
- `location` — the venue text, including the map URL when present.

#### Scenario: October kickoff is converted to UTC

- **WHEN** the kickoff is `24/10/2026` at `17:00` Europe/Madrid
- **THEN** `dates` is `20261024T150000Z/20261024T163000Z` — 15:00Z because Spain is UTC+2 in October under CEST, and the end is 90 minutes later.

#### Scenario: February kickoff is converted to UTC

- **WHEN** the kickoff is `15/02/2026` at `18:30` Europe/Madrid
- **THEN** `dates` is `20260215T173000Z/20260215T190000Z` — 17:30Z because Spain is UTC+1 in February under CET. The same wall clock resolves to a different absolute instant, which is the whole point of converting rather than passing digits through.

#### Scenario: Both halves of `dates` carry `Z`

- **WHEN** the `dates` parameter is built
- **THEN** BOTH the start and the end half end with `Z`. A half without it makes Google treat the range as viewer-local time.

#### Scenario: `ctz` travels alongside the UTC pair

- **WHEN** the Google Calendar URL is generated
- **THEN** it carries BOTH `dates=…Z/…Z` AND `ctz=Europe/Madrid`. They are complementary, not conflicting, and Google preserves both.

#### Scenario: Google accepts the generated URL and preserves every parameter

- **WHEN** the generated URL is requested without a session
- **THEN** Google responds with HTTP 200, redirects to the sign-in page, and echoes the complete original query string — including `action`, `text`, `dates`, `ctz`, `details` and `location` — into the post-sign-in `continue` parameter. No parameter is dropped or rejected.

#### Scenario: Parameters are encoded individually

- **WHEN** the Google Calendar URL is built for a match with a venue and a map URL
- **THEN** each parameter value is `encodeURIComponent`'d individually, so the `&` separators between parameters are literal and the map URL's own `?`/`&` are percent-encoded rather than splitting the parameter list. The `/` inside `dates` is percent-encoded as `%2F`, which Google accepts.

### Requirement: Event title rule

The title-slug of the calendar link MUST be the literal string `Game with ` followed by the opponent team name. The opponent is the team that is NOT one of the user's clubs, determined using the existing `clubAliases(name)` and `isClubMatch(team, aliases)` helpers in `src/lib/clubTeams.ts`:

- If `local` matches one of the user's clubs, the opponent is `visit`.
- If `visit` matches one of the user's clubs, the opponent is `local`.
- If neither matches (defensive fallback), the opponent is `visit`.

The opponent name MUST be trimmed; if it is empty/null, the title falls back to `<local> - <visit>` so the link still works.

#### Scenario: Single line, no club name

- **WHEN** the opponent is "RIVAL"
- **THEN** the title-slug decodes to `Game with RIVAL` and the user's own club name does not appear in the title

#### Scenario: Neither side matches

- **WHEN** neither `local` nor `visit` matches the user's clubs (defensive)
- **THEN** the title-slug decodes to `Game with <local> - <visit>` only if `<local>` is empty/null, otherwise `Game with <visit>`

### Requirement: The landing page rejects a not-ready kickoff

The `/c/[...]` route MUST validate the kickoff before rendering. When the `time` segment decodes to a sentinel (`00:00`, `--:--`) or is missing, or the path has fewer than three segments, the route MUST respond with HTTP 400 and a plain Spanish page explaining that the federation has not published the date and time yet.

The client side never produces such a URL — the calendar line is omitted for pending matches — but the route defends itself because the URL is public and anyone can hand-craft one.

#### Scenario: Pending match in a hand-crafted URL

- **WHEN** a request arrives for `/c/24%2F10%2F2026-00%3A00/Game%20with%20RIVAL/Venue`
- **THEN** the route responds with HTTP 400 and a page saying the date and time are not yet confirmed, and no Google Calendar button is rendered

#### Scenario: Fewer than three segments

- **WHEN** a request arrives for `/c/only-one-segment`
- **THEN** the route responds with HTTP 400 and the same explanatory page

### Requirement: Match duration is fixed at 90 minutes

The Google Calendar link's `dates` end instant MUST be the kickoff plus 90 minutes. The system MUST NOT use a shorter, longer, or unspecified duration — the user has specified 1h30m per match as a hard requirement. The duration is a constant, not a URL parameter.

#### Scenario: 90-minute duration is enforced

- **WHEN** the convocatoria is built for a kickoff at `18:30`
- **THEN** `DTEND` is exactly 90 minutes later (i.e. `20:00` Europe/Madrid for that date).

### Requirement: Production origin uses NEXT_PUBLIC_WEB_APP_URL

`<WEB_APP_BASE_URL>` MUST be resolved as follows:

1. If `process.env.NEXT_PUBLIC_WEB_APP_URL` is set, use it (production deployments).
2. Otherwise, fall back to `window.location.origin` (local development with `npm run dev`).

The env var is required in production because the recipient of the WhatsApp link is on a different device — `localhost:3000` does not resolve to the web-app from the recipient's phone. Local development can rely on `window.location.origin` because the dev tunnel (e.g. ngrok, Cloudflare Tunnel, or Vercel preview deploys) maps the developer's localhost to a public URL that the tester's phone can reach.

#### Scenario: Production build uses the env var

- **WHEN** `NEXT_PUBLIC_WEB_APP_URL=https://team-matches-manager.vercel.app` is set at build time and the Calendario builds a calendar link
- **THEN** the URL's origin is `https://team-matches-manager.vercel.app` regardless of `window.location.origin` (which might still be `http://localhost:3000` during a server-side render of the Calendario)

#### Scenario: Local development falls back to window.location.origin

- **WHEN** `NEXT_PUBLIC_WEB_APP_URL` is NOT set and the Calendario runs in a browser
- **THEN** the URL's origin is `window.location.origin`

### Requirement: The route is reachable without auth

The `/c/[...]` route MUST NOT require any session, cookie, or API key. Anyone who can read the URL MUST be able to see the page — the URL is shared via WhatsApp to recipients who are not club admins. The route MUST NOT log, persist, or otherwise capture the recipient's IP or any other identifying information.

The route is read-only and idempotent (it always returns the same page for the same path). It MUST NOT mutate any server-side state.

#### Scenario: Anonymous request

- **WHEN** a request to `/c/[...]` arrives with no cookies, no `Authorization` header, and no iron-session
- **THEN** the route responds with HTTP 200 and the landing page — no redirect to login, no 401, no 403

#### Scenario: Route does not log identifying information

- **WHEN** the route handles a request from an arbitrary IP and user agent
- **THEN** the route's implementation does not call `console.log` / `console.info` / fetch telemetry with the IP, user agent, or any other recipient identifier — the request is treated as a pure function of its path
