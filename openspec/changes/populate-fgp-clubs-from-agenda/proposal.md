## Why

The `add-fgp-competition-web-api` change shipped an FGP fetcher but no FGP club catalogue. As a result, every `GET /api/matches?competition=FGP&club=<code>` call returns `404 Club <code> not found` — the api-app only knows the FMP clubs. The user wants every club listed in the FGP agenda's "Filtro Club" dropdown available through `/api/matches`, so any FGP club code resolves and returns its upcoming matches.

## What Changes

- Populate `api-app/src/services/competition/clubs.ts` with the 211 clubs extracted from the `<select id="agenda_club_select">` dropdown that the FGP upstream agenda renders (the same HTML the existing FGP fetcher already consumes).
- Each new entry uses `competition: 'FGP'`, the upstream `value` as the numeric `code`, the dropdown label as `name`, and a derived `username` slug (lowercase, non-alphanumerics → `-`, collapsed).
- Mirror the same 211 entries into `web-app/src/constants/clubs.ts` with `competition: 'FGP'`, so the web app's login flow lets the user pick an FGP club from the chip selector.
- **Sidgad reuses numeric club codes across federations** (97 codes are shared between FMP and FGP). To keep the catalogue lossless and the auth flow unambiguous, the lookup maps in both apps are re-keyed as `${CompetitionId}-${code}` (e.g. `FMP-411`, `FGP-411`). The api-app's `getClub(code)` becomes `getClub(code, competitionId?)`; the route passes the requested competition. The web-app's `CLUBS_MAP` and the auto-derived default credentials follow the same composite key (`club-FMP-411`, `club-FGP-411`).

## Capabilities

### Modified Capabilities
- `clubs-auth`: the env-var key shape and the auto-derived default credential format both change from `411` / `club411` to `FMP-411` / `club-FMP-411` (and `FGP-411` / `club-FGP-411`). The semantic contract — "credentials live in an env var; failing closed on bad input; auto-derived defaults for any club not in the env var" — is preserved; only the key shape is tightened to disambiguate shared codes.

## Impact

- `api-app/src/services/competition/clubs.ts` — appended 211 entries (FGP-tagged); `getClub` now accepts an optional `competitionId` and `app.ts` passes it.
- `web-app/src/constants/clubs.ts` — appended 211 entries (FGP-tagged); `CLUBS_MAP` re-keyed to `${CompetitionId}-${code}` via the `clubMapKey(competitionId, code)` helper; `getClubName(code, competitionId?)` filters by competition when supplied.
- `web-app/src/constants/credentials.ts` — `CLUB_CREDENTIALS` re-keyed to composite; auto-derived defaults now `club-<competition>-<code>`; numeric env-var keys are rejected with a warning.
- `web-app/README.md` + `web-app/.env.local.example` — example env var shape updated to `{"FMP-411":{"username":"tiso","password":"tiso"}}`.
- No new dependencies, no route changes. Mobile (`client-app/`) is not modified.