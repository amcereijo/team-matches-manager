## MODIFIED Requirements

### Requirement: Convocatoria includes a one-tap "Add to calendar" link for ready matches
> **Name note.** The header keeps its original wording so the requirement is matched to the existing one at archive time. This change **adds a second link alongside** the existing one — it does not replace it.

When the Calendario builds the WhatsApp convocatoria text for a match, the text MUST contain the line `📅 Añadir al calendario:` followed by the single-match landing-page URL, in its existing slot: after the fixture facts block (kickoff, venue, map link) and before the roster scaffold, on its own line. This line MUST be emitted **only for ready matches** (those with both a date and a confirmed kickoff time), exactly as today.

The text MUST additionally contain a second line, `📅 Calendario del equipo:` followed by the public team calendar URL. The two links serve different intents and both MUST be present:

- **Add to calendar** — the one-tap action for *this* fixture, on the stateless single-match page.
- **Team calendar** — the standing reference to *the squad's full upcoming schedule*, on the live page.

**The team-calendar link belongs at the bottom of the message.** It MUST be emitted after the roster scaffold — after the `No puede:` block — separated from it by a blank line. It MUST NOT appear between the two action blocks or in the middle of the roster: the message reads top-down as facts → the action for this fixture → the roster the volunteers fill in → the standing reference.

**The player roster belongs right after the add-to-calendar link.** When the `📅 Añadir al calendario:` line is present, the text MUST contain a `Jugadores:` block immediately after it, shaped like the other roster lines — `Jugadores:` on its own line and `1.` on the next — separated from the add-to-calendar block by one blank line and from the `Porteros:` block by one blank line. The `Jugadores:` block MUST NOT be emitted when the add-to-calendar line is omitted, since it belongs to that block.

Both URLs MUST be carried by the message as **short links** of the shape `/link/<hash>`, resolved through the app's own link store, so that the message carries short, opaque, revocable URLs instead of long paths that spell out the club, the squad and the venue. A short link MUST resolve to exactly the canonical URL it replaces — `/c/<when>/<title>/<location>` for the single-match page and `/t/<competition>/<clubCode>/<squad>` for the team calendar — and MUST land the recipient on that same page.

When the link store cannot be reached, or the request fails or times out, the text MUST fall back to the canonical URLs — `/c/…` and `/t/…` — exactly as it does today. The message MUST still be composed and the conversation MUST still open; a link-store failure MUST NOT surface an error to the club and MUST NOT remove either link line.

The canonical URLs remain the source of truth for what a link points at. The squad, the opponent, the venue and the kickoff MUST be derived from the fixture by the app exactly as they are today; a short link only changes the URL the recipient is given, never the page they end up on.

The `<squad>` MUST be the squad the convocatoria is for: the side of the fixture belonging to the user's own club. Determining that side MUST use the upstream `param_game` club codes as well as the club's name aliases, because the federation's squad names do not reliably derive from the catalogue's club names (`ALAMEDA DE OSUNA A` is club 386's `ALAMEDA OSUNA HP`). A name-alias-only test matches neither side of such a fixture and produces a link scoped to the rival. If `local` belongs to the club the squad is `local`; if `visit` does, the squad is `visit`. If neither side can be identified, the team-calendar line MUST be omitted and the rest of the message MUST be unchanged.

The team-calendar line MUST NOT be gated on match readiness: the squad name is readable off any fixture, so the line is derivable for a pending match too. The Calendario's "Enviar" control continues to render only for matches with a confirmed date and time, which is unchanged and out of scope.

Each URL segment MUST be encoded with `encodeURIComponent`. Neither URL may contain any `&` or `?` characters, which would cause WhatsApp to wrap the link into unclickable fragments. A short link's hash is alphanumeric and contains neither, so it satisfies this rule by construction.

`<WEB_APP_BASE_URL>` — the public origin of the deployed web-app — MUST be read from the `NEXT_PUBLIC_WEB_APP_URL` env var in production builds, falling back to `window.location.origin` in development, for **both** URLs.

Two mechanisms were evaluated and rejected before landing on Google Calendar, and remain rejected for the per-match "Añadir al calendario" action:

- **iCalendar (`.ics`)** — pointing an `https://` link at a `text/calendar` payload makes Android and iOS **download the file** rather than hand it to the calendar app, adding a download-notification or file-manager step. Rejected: the user does not want a file download.
- **`webcal://`** — Android and iOS both register it with calendar apps, but the scheme is not universally honoured and was inert in Chrome on Android. Rejected: the mechanism does not work reliably.

Both public pages therefore offer **Google Calendar**, reached by tapping a button on the page rather than by putting a Google URL in the message: a `calendar.google.com/...?a=1&b=2…` URL is long and full of `&` separators, which WhatsApp wraps mid-token.

#### Scenario: Ready match, local is "us"

- **WHEN** the Calendario builds the convocatoria for a ready match between club FGP 438 (catalogue name `HL NOROESTE`) and `RIVAL`, where the fixture's squad is `HL NOROESTE A`
- **THEN** the text contains `📅 Añadir al calendario:` with a short link, then a blank line, then `Jugadores:` / `1.`, then a blank line, then `Porteros:` / `1.`, then `Delegado:`, then `No puede:`, then a blank line, then `📅 Calendario del equipo:` with a short link; the two short links resolve to `/c/…` for the fixture and to `/t/FGP/438/HL%20NOROESTE%20A` for the squad

#### Scenario: The team-calendar link is at the bottom

- **WHEN** the convocatoria is built for a ready match
- **THEN** the `📅 Calendario del equipo:` line is the last block of the message, after the `No puede:` line and separated from it by a blank line

#### Scenario: The player roster follows the add-to-calendar link

- **WHEN** the `📅 Añadir al calendario:` line is present
- **THEN** the text continues with a blank line, then `Jugadores:`, then `1.`, then a blank line, then `Porteros:`

#### Scenario: No player roster without the add-to-calendar link

- **WHEN** the match has no confirmed kickoff, so the `📅 Añadir al calendario:` line is omitted
- **THEN** the `Jugadores:` block is omitted too, and the message goes straight from the facts to the roster scaffold

#### Scenario: Squad is taken from the visit side

- **WHEN** `local` is a rival and `visit` belongs to the user's club
- **THEN** the team-calendar link's target carries the `visit` name as its squad segment, and the `/c` title names the `local` side as the opponent

#### Scenario: Club code decides which side is ours when the names diverge

- **WHEN** the club's catalogue name is `ALAMEDA OSUNA HP` (code 386) and the fixture is `ALAMEDA DE OSUNA A` vs `CDE EL CASAR A`, so neither side matches the name aliases
- **THEN** the team-calendar link's target carries the squad segment `ALAMEDA%20DE%20OSUNA%20A` — identified via the `param_game` code — and NOT the rival `CDE%20EL%20CASAR%20A`

#### Scenario: Away fixture names the right opponent

- **WHEN** the fixture is `COSLADA RH A` vs `ALAMEDA DE OSUNA A` for club 386
- **THEN** the `/c` title is `Game with COSLADA RH A`, never `Game with ALAMEDA DE OSUNA A`

#### Scenario: Squad-scope prevents cross-squad leakage

- **WHEN** the club fields both `HL NOROESTE A` and `HL NOROESTE B` and the convocatoria is for a `NOROESTE A` fixture
- **THEN** the team-calendar link's target carries the squad segment `HL%20NOROESTE%20A`, so the linked page lists only that squad's fixtures

#### Scenario: Pending match — line is omitted

- **WHEN** the match's `time` is `--:--` or missing
- **THEN** the `📅 Añadir al calendario:` line is omitted entirely (unchanged behaviour) while the `📅 Calendario del equipo:` line is still derivable, because the squad name is readable off a fixture regardless of whether the kickoff is confirmed

#### Scenario: WhatsApp preview shows the URL unbroken

- **WHEN** either URL exceeds 100 chars after URL-encoding
- **THEN** neither contains `&` or `?` characters, and both render as single contiguous links in the WhatsApp message preview

#### Scenario: The link store is unavailable

- **WHEN** the club shares a match and the link store cannot be reached
- **THEN** the message carries the canonical `/c/…` and `/t/…` URLs instead, the conversation opens normally, and no error is shown to the club

#### Scenario: The short link lands on the canonical page

- **WHEN** a recipient opens the `📅 Calendario del equipo:` short link from a message
- **THEN** the app resolves it and shows the squad's team calendar — the same page, with the same fixtures, that the canonical `/t/…` URL shows

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
- **THEN** the `/c` target carries the venue without a trailing map reference and with no empty parentheses
