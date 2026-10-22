# Tasks

## 1. Extract shared helpers (no behaviour change)

- [x] 1.1 Add `src/lib/html.ts` exporting `escapeHtml` and `splitVenue`, moved verbatim from `src/app/c/[...path]/route.ts` (including the explanatory comments) so both public routes share one implementation.
- [x] 1.2 Export `decodeFully` from `src/lib/calendarEvent.ts` (currently private) so the `/t` route can reuse the WhatsApp-relay defence rather than reimplementing it.
- [x] 1.3 Update `src/app/c/[...path]/route.ts` to import from `lib/html` and `lib/calendarEvent`. Its markup, response shape and status codes MUST be byte-for-byte unchanged.

## 2. Squad resolution and team-calendar URL

- [x] 2.1 Add `squadFor(game, club)` to `src/lib/calendarEvent.ts`: returns `game.local` when it belongs to the club, else `game.visit` when that does, else `game.visit` as the defensive fallback, else `null`. Membership uses a shared `isOurSide(team, teamCode, club)` helper that checks the `param_game` code **and** the name aliases.
- [x] 2.2 Add `TEAM_CALENDAR_PATH_PREFIX = '/t'` and `buildTeamCalendarUrl(club, squad, baseUrl)` producing `/t/<competition>/<code>/<encodeURIComponent(squad)>` with `baseUrl` trailing-slash trimmed.
- [x] 2.3 ~~Remove `buildCalendarUrl`~~ **Superseded during apply**: the user asked for the add-to-calendar link to stay, so `buildCalendarUrl` and its re-export are restored and `MatchesBoard` emits both links.

## 3. Public team calendar route

- [x] 3.1 Create `src/app/t/[competition]/[code]/[squad]/route.ts` as a `route.ts` (not `page.tsx`): no app chrome, no session read, no `<script>`.
- [x] 3.2 Resolve identity from the path only: competition against `COMPETITIONS`, club code against `CLUBS_MAP` via `clubMapKey`. Unknown competition or unknown club MUST render HTTP 404 with a Spanish "link not valid" page.
- [x] 3.3 Decode each path segment with `decodeFully`, then normalise whitespace in the squad segment (`+` → space, collapse runs, trim) so a WhatsApp-relayed link still resolves. A segment that cannot be decoded MUST be used literally rather than throwing.
- [x] 3.4 Fetch the competition's fixtures through a module-scope, hours-long cache of the *unfiltered* federation result so one scrape serves every club in that competition.
- [x] 3.5 Filter to the squad, then to fixtures whose kickoff has not passed, then sort chronologically. Pending fixtures (sentinel/missing time) MUST be kept.
- [x] 3.6 When the identity resolves but nothing matches, respond HTTP 200 with a Spanish empty state — never 404, never another club's fixtures.
- [x] 3.7 Render the page: club/squad header, visible "Datos actualizados a las HH:MM" generation timestamp, the nearest fixture featured, remaining fixtures as rows separated by week, per-row Google Calendar button and `Cómo llegar` map link when a venue exists, and `⏳ hora por confirmar` for pending fixtures. Reuse the CSS-variable block from `/c` and escape every upstream-derived string.
- [x] 3.8 Send `Cache-Control: public, max-age=3600, s-maxage=7200, stale-while-revalidate=21600`, plus `<meta name="robots" content="noindex">`.
- [x] 3.9 On upstream timeout or parse failure respond with a non-200 status and a Spanish "calendar could not be loaded" page — no partial list, no upstream error text, no stack trace.

**Implementation note — two defects found against live data and fixed during 5.2:**

- *Club membership must include the `param_game` code check, not just name aliases.* The federation's squad names do not derive from the catalogue's club names (`ALAMEDA DE OSUNA A` is club 386's `ALAMEDA OSUNA HP`), so a name-only filter returned an empty calendar for exactly the clubs that had diverged most. `selectSquadFixtures` now uses the same two-pronged rule as `getMatchesForClub`.
- *Squad scoping must be an exact normalised comparison, not `isClubMatch`.* `clubAliases('ALAMEDA DE OSUNA A')` yields the stem `ALAMEDA DE OSUNA`, and `isClubMatch`'s `startsWith` rule then matched every sibling squad — squad A's page showed squad B's fixtures (146 rows instead of 51). `normalizeClubName` equality is used instead, mirroring the Calendario's own exact-match team filter.

## 4. Wire the convocatoria message

- [x] 4.1 In `MatchesBoard.tsx`, **keep** the `📅 Añadir al calendario:` line exactly as it was and **add** `📅 Calendario del equipo: <teamUrl>` after it, separated by a blank line, still above the roster.
- [x] 4.2 The team-calendar line has no readiness gate in the message builder. **Scope note:** the Calendario's `Enviar` control keeps its existing `{!ready ? null : …}` gating — the user confirmed only matches with a confirmed date and time offer the button, and lifting that was declined as out of scope.
- [x] 4.3 Thread the club (code + name) into both link builders; confirm the roster scaffold and every other message line are unchanged.

## 5. Verification

- [x] 5.1 Type-check, lint and build pass with no new warnings.
- [x] 5.2 Run the app, open a real `/t/<comp>/<code>/<squad>` URL, and confirm: list renders, nearest fixture is featured, pending row shows "hora por confirmar", per-row calendar button opens Google Calendar. *(Verified against live FMP data for club 386: squad A → 51 fixtures, squad B → 32, no overlap.)*
- [x] 5.3 Repeat 5.2 against a **doubly-encoded** squad segment and a `+`-mangled one; confirm both resolve to the same squad. *(Also verified: doubled spaces and all-lowercase. All four resolve to 51.)*
- [x] 5.4 Confirm the response branches: unknown competition → 404, unknown club code → 404, valid-but-empty squad → 200 empty state. *(All three confirmed.)*
- [x] 5.5 Confirm `/c/[...]` still renders identically. *(`git diff` on that file is exactly 1 insertion / 16 deletions — the two functions moved to `lib/html.ts`. Route still returns 200 with title, venue, map link and calendar button.)*
- [x] 5.6 Confirm the rendered `/t` HTML contains no `<script>` tag, no requester-identifying log, and carries `noindex`. *(0 script tags, 0 subresource loads, noindex present, cache header as specified.)*

## 6. Revisions requested during apply

- [x] 6.1 **Restore the add-to-calendar link in the message.** The "replace" decision was reversed: the convocatoria now carries both `📅 Añadir al calendario:` (`/c`) and `📅 Calendario del equipo:` (`/t`). `buildCalendarUrl` restored; `MatchesBoard` emits both, blank-line separated. *Verified: 43/43 rendered messages carry both links.*
- [x] 6.2 **Rename the team page's action to "Añadir a calendario"** (visible label, `aria-label` and closing hint all consistent).
- [x] 6.3 **Warn that a pending fixture's date is provisional.** Rows without a confirmed kickoff show "hora por confirmar" plus "Fecha temporal: puede cambiar hasta 15 días antes del fin de semana del partido", styled with dedicated light/dark variables. *Verified: 38 of 51 rows carry it; the 13 confirmed rows do not, and carry no note.*
- [x] 6.4 **Fix "which side is ours" to consult `param_game` codes.** `squadFor` was emitting a link scoped to the *rival* (`/t/FMP/386/CDE%20EL%20CASAR%20A`) because neither side alias-matched the catalogue name `ALAMEDA OSUNA HP`. `squadFor` and `opponentFor` now take the club and share one `isOurSide` helper; the `/t` page's private `opponentFor` copy was deleted in favour of the shared one. *Verified across 43 messages: 0 rival-scoped links, 0 calendar titles naming the user's own team, 0 wrong opponents on away fixtures.*
- [x] 6.5 **Stop showing the provisional warning once the date is settled.** The "Fecha temporal" notice appears only while the fixture is more than 15 days away; inside that window the federation cannot move it and the warning would be false. `TEMPORAL_WARNING_DAYS` / `isDateProvisional` live in `lib/matchDate.ts` so the rule is testable in isolation. *Verified by direct boundary tests (±1 ms, CET and CEST, unparseable date).*
- [x] 6.6 **Correction: the warning is about the DATE, not the missing time.** The notice was wrongly gated on `!ready`, so a far-off fixture with a confirmed kickoff time showed nothing. A published time does not lock the date — sidgad can still move the fixture to another day — so the trigger is now distance alone. "Hora por confirmar" remains the separate, orthogonal signal about the time. *Verified across 5 clubs / 148 rows, 0 mismatches; the `(far + confirmed time)` combination now appears (2 rows on TISO PATIN C, including the `domingo, 29 nov` 11:00 case).*

> Follow-ups deliberately kept **out** of this checklist so the apply tracker can
> reach 100%: (1) the admin Calendario still re-scrapes uncached and could use
> `fetchCompetitionMatches`; (2) `buildGoogleCalendarUrl` is re-derived per row,
> which is fine at current volumes but worth revisiting if a squad ever exceeds
> ~50 fixtures. Both are recorded in design.md.