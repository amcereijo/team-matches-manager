## 1. Shared squad model

- [x] 1.1 Add the `Squad` type (`name`, nullable `league`) to `src/types/index.ts`
- [x] 1.2 Add `ourSide(game, club)` to `src/lib/clubTeams.ts`: the upstream club code decides, the club's name aliases are the fallback
- [x] 1.3 Add `squadKey`, `sameLeague`, `ambiguousSquadNames` and `squadLabel` to `src/lib/clubTeams.ts`
- [x] 1.4 Rewrite `squadsForMatches` to derive `(league, team)` pairs with `ourSide`, sorted by team name and then league

## 2. Upstream data

- [x] 2.1 Trim the league cell in `src/services/fgp.ts` (the markup pads it with spaces)
- [x] 2.2 Trim the league cell in `src/services/fmp.ts`

## 3. Calendario filter

- [x] 3.1 Derive the squad list from the club code (`squadsForMatches(matches, club)`) in `MatchesBoard.tsx`
- [x] 3.2 Key the selection by squad key and filter fixtures by (league, team)
- [x] 3.3 Label the options with the league only when the team name is ambiguous
- [x] 3.4 Persist the selection as `{ name, league }` pairs and migrate legacy name-only entries when unambiguous

## 4. Squad calendar link

- [x] 4.1 Make `squadFor` return a `Squad` and decide the club's side through `ourSide`
- [x] 4.2 Make `buildTeamCalendarPath` / `buildTeamCalendarUrl` take a squad and emit the league segment
- [x] 4.3 Send the league with the `team_calendar` short-link request in `MatchesBoard.tsx`

## 5. Short links

- [x] 5.1 Add the league to the `team_calendar` payload, target key and canonical path in `src/lib/shortLink.ts`
- [x] 5.2 Accept an optional `league` on a `team_calendar` request in `src/app/api/links/route.ts`
- [x] 5.3 Offer the club's squads and their leagues in the `/links` picker (`page.tsx`, `LinkList.tsx`)

## 6. Public team calendar page

- [x] 6.1 Move the route to `src/app/t/[competition]/[code]/[...scope]/route.ts` and parse both path shapes
- [x] 6.2 Scope the fixture list by league when the link carries one
- [x] 6.3 Show the league on the page

## 7. Verification

- [x] 7.1 `npm run typecheck` and `npm run lint` pass
- [x] 7.2 Check against the live agenda that every club with fixtures gets a filter, and that the options are differentiated by league
- [x] 7.3 Check that `/t/<comp>/<code>/<league>/<squad>` lists only that league and that `/t/<comp>/<code>/<squad>` still resolves
- [x] 7.4 Check that a `team_calendar` short link resolves to the league-scoped canonical path
- [x] 7.5 Update the README (route table and the squad identity note)
