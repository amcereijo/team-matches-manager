## Why

A club's team is not identified by its name alone. In the Galician federation `DOMINICOS A` (club code 150) fields four different teams — one in ALEVÍN GRUPO A, one in INFANTIL GRUPO B, one in JUVENIL GRUPO B and one in SENIOR MASCULINO — and the same happens in Madrid (`ALAMEDA DE OSUNA A` plays in four competitions). The app treats the name as the identity, and that breaks three things at once:

- **The "Equipos" filter never appears.** The squad list was derived by matching the club's *catalogue name* against the fixture names, and the federation prints `DOMINICOS A` where the catalogue says `CLUB AA DOMINICOS`. The derivation therefore found **zero** squads for all 32 FGP clubs (and for 25 of the 32 FMP clubs), so the dropdown was never rendered even though the agenda itself — which matches by the upstream club code — was full of matches.
- **The filter could not tell two teams apart.** Even when it appeared, its options were bare names, so two different teams with the same name were indistinguishable and could not be selected separately.
- **The squad calendar showed the wrong team's matches.** The WhatsApp link carried only the team name (`/t/FGP/150/DOMINICOS A`), so the public page listed that name's fixtures in *every* league it appears in — four different teams' matches on one page.

## What Changes

- **A squad is identified by (league, team), not by team alone.** The league becomes part of the squad's identity everywhere: the Calendario filter, the squad calendar link, the short-link store and the public team calendar page.
- **The squad list is derived the way the agenda is filtered** — the upstream `param_game` club code first, the club's name aliases as a fallback. This is what makes the filter appear at all: after the change, **32 of 32** FGP clubs and **32 of 32** FMP clubs with fixtures get one (before: 0 and 7).
- **The filter's options are differentiated by league.** An option shows `TEAM — LEAGUE` whenever the same team name is used by more than one league of the club; a name used by a single league stays bare, because the league names are long (`CTO AUT ALEVÍN - 1ª DIVISIÓN - 1ª FASE - GRUPO A`) and printing them everywhere would make the list unreadable.
- **The squad calendar link carries the league**: `/t/<competition>/<code>/<league>/<squad>`. The public page then lists only the fixtures of that league, so a player convoked to the ALEVÍN squad sees the ALEVÍN calendar and not the senior one.
- **The team calendar's short link carries the league too**, so two same-named teams get two different short links instead of sharing one.
- **Links handed out earlier keep working.** The three-segment `/t/<competition>/<code>/<squad>` shape is still accepted and answers with the squad's fixtures across leagues, exactly as before. The short-link store keeps the legacy target key for league-less links, so already-created links are reused rather than duplicated.
- The stored filter selection moves from a list of names to a list of `{ name, league }` pairs. A selection stored before this change is migrated when the name maps to exactly one squad and dropped when it maps to several (picking one of them would be a guess).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendario-team-filter`: the squad list is derived by club code (not by name alone) and is keyed by (league, team); the option label spells the league out when the team name is ambiguous; the persisted selection stores the league.
- `public-team-calendar`: the route gains a league segment, and a link that carries one lists only that league's fixtures.
- `short-links`: the `team_calendar` payload, target key and canonical path carry the league.

## Impact

- **Code:**
  - `src/lib/clubTeams.ts` — new shared squad model: `ourSide`, `squadKey`, `sameLeague`, `squadsForMatches`, `ambiguousSquadNames`, `squadLabel`. The squad derivation moves here from a name-only helper.
  - `src/lib/calendarEvent.ts` — `squadFor` returns a `{ name, league }` squad; `buildTeamCalendarPath` / `buildTeamCalendarUrl` take a squad and emit the league segment; `opponentFor` decides "which side is ours" through the shared `ourSide`.
  - `src/lib/shortLink.ts` — `team_calendar` payload, target key and canonical path carry the league.
  - `src/app/api/links/route.ts` — the `team_calendar` request accepts an optional `league`.
  - `src/app/(app)/calendario/MatchesBoard.tsx` — league-aware filter (options, selection, persistence) and league-aware squad link in the convocatoria.
  - `src/app/(app)/links/page.tsx`, `LinkList.tsx` — the squad picker offers the club's squads and their leagues.
  - `src/app/t/[competition]/[code]/[squad]/route.ts` → `src/app/t/[competition]/[code]/[...scope]/route.ts` — the route accepts both path shapes and scopes the fixture list by league.
  - `src/services/fgp.ts`, `src/services/fmp.ts` — the league cell is trimmed (the upstream markup pads it with spaces, and the league now travels in URLs and labels).
- **APIs:** one public route changes shape (`/t/<comp>/<code>/<league>/<squad>`); the old shape is still served. `POST /api/links` accepts an optional `league` on a `team_calendar` request.
- **Dependencies:** none.
- **Compatibility:** already-sent links and already-created short links keep resolving; the only visible difference is that newly sent convocatorias point at a league-scoped calendar.
