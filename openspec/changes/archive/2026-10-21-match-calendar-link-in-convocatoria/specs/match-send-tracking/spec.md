## ADDED Requirements

### Requirement: Convocatoria includes a one-tap "Add to calendar" link for ready matches

When the Calendario builds the WhatsApp convocatoria text for a ready match (one where `isMatchReady(row)` is true — has both a `date` and a non-sentinel `time`), the text MUST contain a single extra line of the form `📅 Añadir al calendario: <url>` placed **after** the `<local> - <visit>` line and **before** the first numbered slot of the player list. The line MUST be separated from the surrounding text by exactly one blank line above it (so it reads as its own block in WhatsApp).

For a match that is NOT ready (no `date`, or a sentinel/missing `time` like `00:00` or `--:--`), the line MUST be omitted entirely — the convocatoria text matches today's behavior byte-for-byte.

The URL MUST point at the web-app's **calendar landing page**, which renders a human-readable summary of the match plus a single button that opens the device's calendar app directly. The URL MUST be encoded as **path segments**, NOT query parameters:

```
<WEB_APP_BASE_URL>/c/<date>-<time>/<title-slug>/<location-slug>
```

`<WEB_APP_BASE_URL>` is the public origin of the deployed web-app — read from the `NEXT_PUBLIC_WEB_APP_URL` env var in production builds, falling back to `window.location.origin` in development. Each segment MUST be encoded with `encodeURIComponent` (so spaces become `%20` and special characters are percent-encoded). The URL MUST NOT contain any `&` or `?` characters that could trigger WhatsApp's URL line-wrap to break the link visually.

**Path segments:**

- `date` — `dd/mm/yyyy` from sidgad (e.g. `18/10/2026`), URL-encoded as `18%2F10%2F2026`. The route decodes it back to `18/10/2026` before parsing.
- `time` — `hh:mm` (e.g. `18:30`), URL-encoded as `18%3A30`.
- `title-slug` — the event title as `Game with <opponent>` (see *Event title rule*), URL-encoded.
- `location-slug` — the venue name, URL-encoded. If `map` is present, the location-slug is `<location> (<map URL>)` (URL-encoded); if absent, just `<location>`.

The SAME URL serves only HTML — a standalone landing page. The route MUST NOT serve an iCalendar document and MUST NOT expose any `.ics` download.

The `webcal://` URL that the landing page's button navigates to is the SAME path with the `webcal:` scheme: `webcal://<host>/c/<when>/<title>/<location>`.

Two mechanisms were evaluated and rejected before landing on Google Calendar:

- **iCalendar (`.ics`)** — pointing an `https://` link at a `text/calendar` payload makes Android and iOS **download the file** rather than hand it to the calendar app, adding a download-notification or file-manager step. Rejected: the user does not want a file download.
- **`webcal://`** — Android and iOS both register it with calendar apps, but the button was inert in Chrome on Android, and the scheme is not universally honoured. Rejected: the mechanism does not work reliably.

The landing page therefore links to **Google Calendar**, which is the one mechanism that opens the calendar app on both Android and desktop without a download.

Why a landing page rather than the Google Calendar link directly in the message: a `calendar.google.com/...?a=1&b=2…` URL is long and full of `&` separators, which WhatsApp wraps mid-token — the link renders as broken fragments and stops being tappable as one unit. Path segments contain no `&`, so this page's URL survives the message intact, and the page gives the recipient something readable before they commit.

Next.js does not permit a `page.tsx` and a `route.ts` at the same path. Since the landing page is the only representation of this URL, this is not a constraint — the route handler renders the HTML directly, which means the page is plain server-rendered HTML and cannot use a CSS module or a client component.

#### Scenario: Ready match, local is "us"

- **WHEN** the Calendario builds the convocatoria for a ready match where `local` is one of the user's clubs (per `clubAliases`/`isClubMatch`), `visit` is "RIVAL", the kickoff is `18:30` Europe/Madrid on `18/10/2026`, `location` is "Pabellón X" and `map` is "https://maps.example/pabellon-x", and `<WEB_APP_BASE_URL>` is `https://team-matches-manager.vercel.app`
- **THEN** the text contains the line `📅 Añadir al calendario: https://team-matches-manager.vercel.app/c/18%2F10%2F2026-18%3A30/Game%20with%20RIVAL/Pabell%C3%B3n%20X%20(https%3A%2F%2Fmaps.example%2Fpabellon-x)` immediately after the `Local - Visit` line, separated by one blank line, and the URL contains NO `&` or `?` characters

#### Scenario: WhatsApp preview shows the URL unbroken

- **WHEN** the URL produced for a ready match has length > 100 chars after URL-encoding
- **THEN** the URL still contains no `&` or `?` characters that could trigger WhatsApp's URL line-wrap behavior. The whole URL is displayed as a single contiguous link in the WhatsApp message preview.

#### Scenario: Pending match — line is omitted

- **WHEN** the Calendario builds the convocatoria for a match whose `time` is `--:--` or missing
- **THEN** the produced text contains no `📅` character and no `team-matches-manager.vercel.app` URL; the text matches the current implementation byte-for-byte

#### Scenario: Ready match with no map URL

- **WHEN** the Calendario builds the convocatoria for a ready match with `location: "Pabellón X"` and `map: null`
- **THEN** the location-slug is just `Pabell%C3%B3n%20X` with no trailing map reference and no empty parentheses

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