## MODIFIED Requirements

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

## ADDED Requirements

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