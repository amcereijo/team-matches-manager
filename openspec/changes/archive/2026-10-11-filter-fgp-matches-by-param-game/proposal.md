## Why

The web-app's FGP fetcher (`web-app/src/services/fgp.ts`) returns the right rows from sidgad, but the dispatcher (`web-app/src/services/competition.ts`) filters the matches by string-matching the cell text (e.g. `"HL NOROESTE"`) against the club's `name` field in `web-app/src/constants/clubs.ts`. That comparison almost never succeeds because:

1. The sidgad match cells display a different (often older or differently-formatted) club label than the dropdown. Example: `param_game="2_15_415_438_4854003"` (local 415, visit 438) shows the cell text `MASTERS HOCKEY LIÑA`, but the dropdown label for code 415 is `CD MASTERS HL`. Our catalogue carries the dropdown label.
2. Many of the 211 FGP clubs have **zero rows in the current snapshot** where their dropdown label appears in any cell — but they **do** appear in the `param_game` attribute as the local/visit code. HL NOROESTE (438) is one example: 56 rows reference code 438 in `param_game`, but no cell text contains `"HL NOROESTE"`. So `getMatchesForClub(438)` returns `matches:[]` even though HL NOROESTE has 56 scheduled fixtures.
3. FMP doesn't have this problem because sidgad's FMP feed consistently writes the same name into both the dropdown and the cell text. FGP's feed is inconsistent — the same `code` can render with different names in different contexts.

Sidgad itself solves this on the agenda page by filtering on `param_game[2]` and `param_game[3]` (the local/visit codes), not on cell text (see the page's `filtrar_agenda()` JS, which checks `parseInt(agenda_club_select)==parseInt(param_game[2]) || ==parseInt(param_game[3])`).

## What Changes

- **Parse `param_game` codes.** Update `web-app/src/services/competition.ts`'s `parseFilaAgenda` to extract `param_game[2]` (local code) and `param_game[3]` (visit code) from each row's `param_game` attribute. Add a new `Game` field for each, and surface both codes in the `MatchesResponse`.
- **Code-based filter.** Update the `getMatchesForClub` filter to compare the requested club's `code` against the row's `localCode` / `visitCode` first, falling back to the existing name-based alias match only when the codes are missing. This mirrors what sidgad's own filter does.
- **Optional: keep the name-based alias match as a fallback** so the existing FMP path (where cell text matches catalogue names exactly) continues to work without regression. Both checks run; either match is enough.
- **Types update.** Extend `Game` and `MatchesResponse` in `web-app/src/types/index.ts` with `localCode` / `visitCode` fields. These are nullable so a future upstream that omits `param_game` still parses.
- **No new dependencies, no api-app work.** The fix is entirely inside `web-app/src/services/competition.ts` and the `Game` type. The api-app layer is gone (revert), and the mobile app (`client-app/`) is untouched.

## Capabilities

### New Capabilities
- `match-filter-by-param-game`: the web-app's `getMatchesForClub` MUST use the row's `localCode` and `visitCode` (from `param_game`) as the primary signal when matching the requested club. The existing alias-based name match remains as a fallback. Both signals MAY be used in parallel; a match on either is sufficient.

## Impact

- **FGP match coverage jumps from 6/211 clubs to most clubs that have any upcoming rows.** HL NOROESTE (438) goes from 0 matches to 56 in the current snapshot. A GUARDA (162), ADC ALQUIMIA (165), and most other FGP clubs get their real fixtures instead of empty results.
- **FMP coverage is unchanged.** FMP's cell text matches the catalogue's `name` exactly, so the existing alias-based path was always sufficient for FMP. The code-based filter becomes a redundant second check (still correct, just doesn't add new matches).
- **No security implications.** We're reading upstream-supplied numeric codes from `param_game` and matching them against our own catalogue. No cross-federation collision possible (codes from one federation don't appear in another's catalogue — composite-keying in `clubs-auth` already enforces this for the auth layer; the matches filter doesn't carry a federation token, but FMP and FGP feeds use disjoint code ranges plus the dispatch is on competition first).
- **One more parsing concern.** The 8 `param_game` positions are sidgad-internal. If sidgad adds a position or renames them, our parsing breaks. The proposal accepts this risk (FMP/FGP have been stable on this layout for years) and the parser tolerates missing/malformed values by falling back to name-based matching.