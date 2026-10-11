## 1. Extend the Game shape with `localCode` / `visitCode`

- [x] 1.1 In `web-app/src/types/index.ts`, extend `Game` with `localCode: number | null` and `visitCode: number | null`. The fields are nullable so a row without `param_game` still parses.

## 2. Parse `param_game` in the dispatcher

- [x] 2.1 In `web-app/src/services/competition.ts`, update `parseFilaAgenda` to read `$(el).attr('param_game')`, split on `_`, take positions `[2]` and `[3]` as the local and visit codes. Each code is `parseInt(value, 10)` if numeric, else `null`. Store the codes in the `Game` object as `localCode` / `visitCode`. *(Task note: parsing lives in the per-competition fetchers `fmp.ts` and `fgp.ts`, not in `competition.ts`. Same parser logic added to both — 4 lines of helper + a single destructuring + two new fields in the Game push.)*
- [x] 2.2 Verify the parser still produces the same fields it did before (league, date, time, local, visit, location, map) — the change is additive.

## 3. Code-based filter with name-match fallback

- [x] 3.1 In `web-app/src/services/competition.ts`, update the filter inside `getMatchesForClub` so a row is kept when **any** of the following is true:
  - `m.localCode === club.code` or `m.visitCode === club.code` (primary), OR
  - the existing `isClubMatch(m.local, aliases) || isClubMatch(m.visit, aliases)` (fallback).
- [x] 3.2 The `aliases` (suffix-stripping) logic is kept untouched for the fallback path.

## 4. Build + smoke-test

- [x] 4.1 Verify `npm run build` in `web-app/` still passes (no type errors).
- [x] 4.2 Start the web-app (`npm run dev`). Login as `tiso`/`tiso` (FMP 411 TISO PATIN). Hit `GET /calendario` with the session cookie — expect the same 60+ TISO PATIN matches as before (no regression). *(Verified: 60 TISO PATIN render hits, matches literal length 96+ chars.)*
- [x] 4.3 Login as `artabros`/`artabros` (FGP 438 HL NOROESTE). Hit `GET /calendario` — expect a non-empty `matches` array filtered to HL NOROESTE. (Previously 0.) *(Verified: 56 vs render hits, matches literal length 11382 chars. Was 0 before this change.)*
- [x] 4.4 Login as `club-FGP-411`/`club-FGP-411` (FGP 411 RAPOSOS). Hit `GET /calendario` — expect 12+ RAPOSOS matches (previously 12; should still be 12 or more). *(Verified: 12 vs render hits — same as before.)*
- [x] 4.5 Pick a club with no upcoming matches at all (e.g. `club-FGP-460`/`club-FGP-460`, FGP 460 PAN). Hit `GET /calendario` — expect an empty `matches` array (the filter is correct, upstream has nothing for that club). *(Verified: 0 vs render hits, matches literal `[]`, empty state copy "agendados por la federación para tu club".)*
- [x] 4.6 Scope expansion: the dispatcher's signature changed from `getMatchesForClub(clubCode: number)` to `getMatchesForClub(club: ClubType)`. The old `CLUBS.find((c) => c.code === clubCode)` lookup picked the wrong federation when codes collided (FMP 438 = IMPULSO URBANO HL, FGP 438 = HL NOROESTE). The session already carries the full `club` object with `competition` + `code`, so passing it through is the correct fix. Two call sites updated (`page.tsx`, `calendario/page.tsx`).

## 5. Final verification

- [x] 5.1 `git diff --stat HEAD -- client-app/` is empty (mobile app untouched).
- [x] 5.2 `git diff --stat HEAD -- api-app/` is empty (api-app untouched). *(Pre-existing diff vs HEAD in `api-app/src/app.ts` + `api-app/package-lock.json` is from the uncommitted `revert-competition-api-to-web-app` change, not from this change. `git diff --stat -- api-app/` for files modified by THIS change only: zero. Verified by `git log --oneline -- api-app/src/app.ts` — the only commit touching it is `90be15f Add api project`.)*
- [x] 5.3 `openspec validate filter-fgp-matches-by-param-game --strict` passes.