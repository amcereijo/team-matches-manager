## Context

See `proposal.md` — Why.

The technical facts that shape the approach:

- **The upstream row is the only source of truth.** sidgad's `param_game` attribute is `<modality>_<round>_<localCode>_<visitCode>_<competitionId>`. The two club codes identify the clubs; the last segment is the league's competition id. The **league name** comes from the row's own league cell, which is a styled `<div>` whose text carries the markup's padding (`" LIGA REGULAR SENIOR MASCULINA"`).
- **The club code is the reliable link between the catalogue and the fixtures.** The catalogue stores one name per club (`CLUB AA DOMINICOS`) while the federation prints `DOMINICOS A`; the code (150) is the only thing both agree on.
- **The league name is stable across a season, the competition id is not.** The id changes every season, so it cannot travel in a URL that players keep for months. The league *name* is what the club and the players recognise.
- **Both federations have the same shape.** FGP has 31 leagues (age groups and categories), FMP has 41 (autonomous tournaments and leagues). The same club fields the same team name in several of them in both.

Constraints: no test framework in the repo (`lint` + `typecheck` only), the public `/t` route must stay script-free and anonymous, and links already sent via WhatsApp must keep working.

## Goals / Non-Goals

**Goals:**

- One definition of "which of my teams" that the agenda, the filter, the squad link and the public page all share.
- A team calendar link that names exactly one team.
- No breakage of links already in players' chats.

**Non-Goals:**

- Changing what the *agenda* shows: a club's agenda legitimately spans every league it plays in.
- A per-league view of the agenda. The filter narrows by team; the league is part of the team's identity, not a separate dimension the club browses.
- Storing the league in the club catalogue. The catalogue knows clubs, not squads.

## Decisions

### D1 — A squad is `{ name, league }`, and the league is optional

The squad type carries a nullable league. Null means "no league known" — a hand-typed squad on the `/links` page, or a legacy link. A null league keeps the old behaviour (name-only scope) rather than inventing one.

*Alternative considered:* a `SquadKey` string (`league|name`) everywhere instead of an object. Rejected: the object keeps the fields readable at every call site, and the key function is one line.

### D2 — Squads are derived by club code first, name aliases second

`ourSide(game, club)` decides which side of a fixture belongs to the club: the code wins, the aliases are the fallback. This mirrors what `getMatchesForClub` already does to build the agenda, which is why the agenda had matches while the filter had none.

*Alternative considered:* keep the alias-only derivation and add a name alias table per club. Rejected: it needs a maintained mapping of every club to every spelling the federation uses — and the codes are already in the data.

*Consequence:* `opponentFor` now decides "which side is ours" through the same helper, so the calendar event title, the squad link and the filter can never disagree about which side is the club's.

### D3 — The league travels in the URL as its own segment

`/t/<competition>/<code>/<league>/<squad>`.

*Alternative considered:* encoding the league inside the squad segment (`<league>~<squad>`). Rejected: it puts a delimiter inside a user-visible name, and a squad or league containing the delimiter would break the parse.

*Alternative considered:* replacing the squad segment with the league's upstream competition id. Rejected: the id changes every season, so a link a player keeps for months would stop resolving.

### D4 — The route becomes a catch-all so both path shapes are served by one handler

`src/app/t/[competition]/[code]/[squad]/route.ts` becomes `src/app/t/[competition]/[code]/[...scope]/route.ts`. Next.js rejects two routes that use different dynamic names for the same path position, so a sibling `[league]/[squad]` route cannot coexist with `[squad]`; a catch-all can, and it lets one handler answer both shapes.

*Alternative considered:* two separate route files sharing a helper module. Rejected: the identity validation, the decoding and the response matrix would be split across two entry points for no gain — the difference between the shapes is one array's length.

The catch-all also matches `/t/<competition>/<code>` with an empty scope, which the handler answers with the 404 page — the same answer Next.js gave when the squad segment was missing.

### D5 — The label shows the league only where the name is ambiguous

`ambiguousSquadNames` counts how many leagues use each team name; a name used by more than one gets `TEAM — LEAGUE`, a name used by one stays bare. The league names are long (`CTO AUT ALEVÍN - 1ª DIVISIÓN - 1ª FASE - GRUPO A`) and printing them everywhere would make the dropdown unreadable, while printing them nowhere would make the ambiguous ones indistinguishable.

### D6 — The persisted selection stores `{ name, league }`, and legacy entries are migrated when unambiguous

The old selection was a list of bare names. A bare name maps to exactly one squad in most clubs, so it is migrated to that squad; when it maps to several (the ambiguous case) it is dropped, because picking one would be a guess. The alternative — keeping the old format and resolving names at render time — would make every ambiguous selection silently mean "all leagues".

### D7 — The league cell is trimmed upstream

The federation's league text carries the markup's own padding. It is trimmed in both scrapers because the league now travels in URLs, in labels and in comparisons; an untrimmed value would make `" LIGA X"` and `"LIGA X"` two different leagues in a string comparison. Comparisons use `sameLeague`, which normalises, so trimming is belt-and-braces rather than the only defence.

### D8 — Legacy links keep their old target key

`targetKeyFor` keeps the old key shape for a league-less team-calendar link, so the links a club already holds are reused instead of duplicated. A league-scoped link gets a new key that includes the league, which is what keeps the two same-named teams apart.

## Risks / Trade-offs

- **A league rename upstream orphans a selection.** The federation renaming a league (`LIGA REGUAR XUVENIL` → `LIGA REGULAR XUVENIL`) changes the squad key, so a stored selection for it is dropped and a sent link would show the new league's fixtures only. Mitigation: the stored league is compared by normalised string, so case and spacing changes are absorbed; a genuine rename simply resets the filter to "Todos", which is the same behaviour as a renamed squad today.

- **A club's fixtures are spread over many leagues, so the filter list can be long.** A Galician club can field a dozen teams across a dozen leagues. Mitigation: the list is sorted by team name, the league is only spelled out where needed, and the trigger shows a count rather than the list.

- **A player's link stops showing the other leagues' fixtures.** A squad calendar is now scoped to one league, so a player who used to see every fixture of their team name now sees only their league's. Mitigation: this is the point of the change — those fixtures belong to a different team — and the page names the league it is showing.

- **The `param_game` code is missing on some rows.** The code is the primary identity signal; without it the derivation falls back to the aliases, which is what produced empty filter lists before. Mitigation: the fallback is kept, and rows without codes are rare in the current upstream data.

## Migration Plan

No data migration. The store's `link` table keeps its schema: a league is an optional field inside the existing JSON payload. Existing rows keep resolving to their old canonical path, because a payload without a league produces the three-segment path.

Rollback: revert the code. Links already sent with a league in the address would then 404 on the old route, so a rollback should keep the catch-all handler reading both shapes.

## Open Questions

None.
