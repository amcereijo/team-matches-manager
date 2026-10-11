## Context

`api-app/src/services/competition/clubs.ts` today holds only FMP clubs. The user pointed out the FGP upstream agenda (`https://www.competiciones.fgpatinaxe.gal`) ships a `<select id="agenda_club_select">` with every club the federation covers, and asked for those clubs to populate the api-app catalogue so `GET /api/matches?competition=FGP&club=<code>` resolves and `/api/matches` returns matches.

The 211 clubs can be scraped from the same HTML the existing FGP fetcher already pulls (`POST https://sidgad.cloud/shared/portales_files/agenda_portales.php` with `cliente=fgpatinaxe&idm=1&id_temp=31`); the `<option value="<code>"><name></option>` lines are easy to parse. We extract them once now and ship them as data so the api-app can resolve them without scraping on every request.

See `proposal.md` for motivation; this change has no spec-level behaviour delta (`skip_specs: true`).

## Goals / Non-Goals

**Goals:**
- Add 211 FGP-tagged clubs to the api-app catalogue, one per `<option>` in the upstream's `agenda_club_select` dropdown.
- Mirror the same 211 entries into `web-app/src/constants/clubs.ts` so the login picker surfaces FGP clubs.
- Derive a `username` slug from the dropdown label so the existing login flow keeps using `club<code>` defaults for any FGP club too.

**Non-Goals:**
- Refreshing the club list from the upstream on each `/api/matches` call (the catalogue stays a static seed; periodic refresh is a separate change).
- Touching FMP entries — they stay exactly as they are.
- Adding new HTTP routes or new behaviour to `clubs-auth` beyond the existing `club<code>` default credential path.

## Decisions

### D1. Static seed rather than per-request scraping

- **Rationale:** Scraping the dropdown per request would mean two upstream POSTs per `/api/matches` call (one for the agenda, one for the dropdown) or a single POST that ignores the dropdown. A static seed keeps the existing single-POST behaviour intact and matches how FMP clubs have always been handled.
- **Alternative considered:** Server-side parse of the dropdown on demand. Adds a second upstream call (or duplicate parsing of the same response); sidgad may rate-limit; not worth it for data that changes a few times a season.
- **Alternative considered:** Persist the catalogue in the sqlite DB. Overkill for static configuration; the existing FMP entries are inlined in TS for the same reason.

### D2. Derive `username` from the dropdown label

- **Rationale:** The login screen derives the default credentials as `club<code>` (the existing `src/constants/credentials.ts` in web-app). To keep that path working for FGP clubs without writing 211 hard-coded usernames, the catalogue's `username` field is the slugified label. `getClub(code, competitionId).username` then drives the same `club<code>` default credential path.
- **Alternative considered:** Leave `username` empty and rely solely on the numeric code. Works for the api-app but breaks the web-app login picker, which expects a non-empty username to display.
- **Alternative considered:** Force every FGP club to use the same default (`club<code>` regardless of the dropdown label). Same outcome; we still need a username for the picker display.

### D3. Mirror the catalogue into `web-app/src/constants/clubs.ts`

- **Rationale:** The web-app's login screen renders the club picker from `web-app/src/constants/clubs.ts`, filtering by the selected competition. Without mirroring, the FGP picker would still be empty even though the api-app knows the clubs.
- **Alternative considered:** Have the web-app ask the api-app for the club list per competition (`GET /api/competitions/<id>/clubs`). Cleanest design but a new endpoint that isn't required by the spec; we'd be adding scope.
- **Alternative considered:** Have the web-app ask the api-app for the clubs already present in the response (the `teams` field of `/api/matches`). That works for the calendar but not for login (you need the list before any matches are fetched).

### D4. Two files, one source of truth

- **Rationale:** The web-app and api-app both need the catalogue. Keeping them in sync via copy-paste matches how the existing FMP entries are duplicated (web-app's `constants/clubs.ts` already mirrors the data that the api-app's `services/competition/clubs.ts` then duplicates — note the FMP data already lives in both files). Adding a separate package would be over-engineering for this size of data.
- **Alternative considered:** Shared `@interal/type/clubs` workspace. Out of scope for this change; matches existing repo decisions.

### D5. Composite keying — sidgad reuses numeric codes across federations

- **Rationale:** 97 codes are shared between FMP and FGP (e.g. code `411` is FMP `TISO PATIN` and FGP `RAPOSOS`). A flat `Record<number, ClubEntry>` is fundamentally lossy: the last-write-wins `reduce` silently overwrites whichever federation was inserted first, and the login path `findClubByCredentials(username, password)` resolves to a country against a single (last-write) club for that code, allowing cross-federation credential collisions. The fix is composite keying — every lookup is scoped by `(competition, code)`, so the catalogue is lossless and the auth flow is unambiguous.
- **Alternative considered:** Dedupe at array-build (drop one federation per shared code). Lossy; rejects ~97 FMP clubs.
- **Alternative considered:** Offset FGP codes by a fixed amount. Would force re-translation on every upstream fetch (sidgad emits the original codes), which contradicts D1.
- **Concrete shape:
  - `CLUBS_MAP` becomes `Record<`${CompetitionId}-${code}`:` ClubType>`. Helper `clubMapKey(competitionId, code) → "FMP-411"`.
  - `web-app/src/constants/credentials.ts` keys `CLUB_CREDENTIALS` by the same composite key. `findClubByCredentials` iterates composite keys, looks up `CLUBS_MAP[composite]`, and returns the right club. Default `club<code>` becomes `club-<competition>-<code>` to keep the two federations from colliding on credentials (`club-FMP-411` vs `club-FGP-411`).
  - `api-app` already keyed `getClub(code, competitionId?)` against the array directly; the route already passes `competitionId`. The api-app side is functionally already correct after the minimal `getClub(code, competitionId)` overload — no further keying needed there, but we mirror the same composite map for read-side convenience and to keep the two files structurally aligned.

## Risks / Trade-offs

- **Club list drifts from upstream** → The sidgad dropdown will add or rename clubs over time. Mitigation: document a one-shot refresh procedure (re-run the curl + extract step) in `api-app/README.md`; periodic refresh is deferred to a follow-up change.
- **Slug collisions** → Two distinct club names could slugify to the same `username`. Mitigation: collisions are rare and the `username` is used only as a display hint + default credential key; collisions don't break the flow because the canonical lookup is by composite `(competition, code)`. If a collision does happen for two FGP clubs, append `-2`, `-3`, etc. to the slug.
- **Duplication drift** between `api-app/src/services/competition/clubs.ts` and `web-app/src/constants/clubs.ts` → Mitigation: both files are written from the same script output (`/tmp/fgp-clubs.tsv`) so they start in sync. The api-app README already warns about updating both; we extend that note for FGP entries.
- **Composite-key refactor touches `credentials.ts`** → `CLUB_CREDENTIALS` must be keyed by `${competition}-${code}` (not numeric `code`) so shared codes don't share credentials. Default credentials become `club-<competition>-<code>` (e.g. `club-FMP-411`, `club-FGP-411`). Existing deploys that set `CLUB_CREDENTIALS_JSON` with numeric keys must update to the composite key — call this out in `web-app/README.md`.

## Migration Plan

1. Land the catalogue additions in both `api-app/src/services/competition/clubs.ts` and `web-app/src/constants/clubs.ts`.
2. Verify `npm run build` (api-app) and `npm run build` (web-app) still pass.
3. Smoke-test: `curl 'http://localhost:3001/api/matches?competition=FGP&club=162'` (A GUARDA H.LIÑA) returns a non-empty `matches` array filtered to that club. Repeat for at least one club per discipline (HL, PA, HP) to confirm the alias filter covers FGP.
4. Rollback: `git revert <commit>` — both files revert atomically; mobile app unaffected.