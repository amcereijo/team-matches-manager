## Context

`web-app/src/services/competition.ts` parses sidgad's HTML into a `Game` shape and filters it by club name. The parser reads cell text (the team name in the rendered `<td>`). The filter then asks "is the cell text the same as the catalogue's `name` for this club?". For FMP this works because sidgad's FMP feed is internally consistent. For FGP it doesn't: 56 rows reference HL NOROESTE's `code=438` in `param_game`, but the cells in those rows never contain the literal string `"HL NOROESTE"` — they show the opponent's display name (which itself is often different from the dropdown label for the opponent's code).

Sidgad's own agenda page uses the `param_game` codes for filtering (see the embedded `filtrar_agenda()` JS, line 13234: `if ( (parseInt(agenda_club_select)==parseInt(param_game[2])) || (parseInt(agenda_club_select)==parseInt(param_game[3])) )`). The web-app should do the same.

See `proposal.md` for motivation. This change adds a new capability `match-filter-by-param-game` and updates the parser to read both cell text AND codes, then prefers the code match when filtering.

## Goals / Non-Goals

**Goals:**
- Extract `param_game[2]` (local code) and `param_game[3]` (visit code) when parsing each row.
- Filter on those codes first; fall back to the existing name-based alias match.
- Make the change backwards-compatible: a future upstream that omits `param_game` still works via the name-based fallback.

**Non-Goals:**
- Changing the FMP fetcher. FMP's feed is already consistent; the existing alias-based path covers it.
- Changing the api-app (it's gone, reverted).
- Touching `client-app/`.
- Refactoring the parser into a shared module — `web-app/src/services/competition.ts` and the per-competition fetchers are deliberately self-contained for the auto-content model.

## Decisions

### D1. Surface `localCode` / `visitCode` on the Game shape (rather than only filtering server-side)

- **Rationale:** Surfacing the codes as nullable fields on `Game` lets the caller (page or any future consumer) decide what to do. We use them server-side in the filter, but they're also visible in the API response. The change is non-breaking: existing FMP rows already have codes, the field is just absent today.
- **Alternative considered:** Filter internally in the parser and drop rows that don't match the requested club. Saves bandwidth on the wire, but the `MatchesResponse` shape (`{ teams, fields, matches }`) includes `matches` for the *requested* club only — the team/field lists are useful for the chip selector and need ALL rows. Filtering at the parser level would lose the team/field catalogue. So we keep filtering at the dispatcher and surface the codes.

### D2. Code match is primary, name match is fallback

- **Rationale:** For FGP, the cell text is unreliable. For FMP, the name match still works (FMP is internally consistent). Both check paths run; either is enough. This keeps the change non-regressive for FMP and fixes FGP in one go.
- **Alternative considered:** Drop the name-match path entirely. Tempting (cleaner), but adds risk for FMP if sidgad changes the FMP feed's cell text. The fallback is one `||` and the cost is small.

### D3. Parse `param_game` defensively (nullable, not throw)

- **Rationale:** `param_game` is a `class="fila_agenda pista_X" param_game="1_7_147_152_4853980"`-style attribute. If a row is missing the attribute or has a malformed value (one segment instead of 5, non-numeric codes), the parser stores `null` for `localCode`/`visitCode`. The name-match fallback then handles those rows. No `throw`; never break the Calendario because of one bad row.
- **Alternative considered:** Throw on missing/malformed `param_game`. Forces every upstream variant to provide the codes. Real risk: any future sidgad change that omits the attribute would take down the Calendario. Defensive parsing wins.

### D4. Reject the api-app, keep the change scoped to web-app

- **Rationale:** The previous change (`revert-competition-api-to-web-app`) moved scraping back into the web-app; this fix belongs there. The api-app doesn't have a sidgad client anymore. Touching it would re-introduce the proxy that the user just removed.
- **Alternative considered:** Add a `param_game` parser to api-app too. Out of scope (api-app is at its pre-FGP state).

## Risks / Trade-offs

- **Malformed `param_game`** → Some rows may have missing/malformed `param_game`. Mitigation: defensive parsing; fall back to name match.
- **Upstream contract change** → Sidgad could change `param_game` semantics. Mitigation: same as above.
- **Two filtering paths (code + name)** → Slightly more code than a single check. Mitigation: both are simple; the extra cost is one `||`.
- **No regression on FMP** → The fallback ensures FMP keeps working even if our new code path is buggy. Smoke test against FMP 411 in the tasks.

## Migration Plan

1. Land the parser + filter change in `web-app/src/services/competition.ts` and the `Game`/`MatchesResponse` types in `web-app/src/types/index.ts`.
2. Verify `npm run build` in `web-app/` still passes.
3. Smoke-test with curl: FGP 438 (HL NOROESTE) goes from 0 to non-zero matches; FGP 411 (RAPOSOS) keeps its 12 matches; FMP 411 (TISO PATIN) keeps its 60 matches.
4. Rollback: archive this change. The previous (name-only) filter path is restored; behaviour reverts to current.