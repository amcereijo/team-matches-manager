## 1. Backend: add competition fetcher scaffolding

- [x] 1.1 Add `axios`, `cheerio`, and `he` to `api-app/package.json` under `dependencies` and run `npm install` in `api-app/`.
- [x] 1.2 Create `api-app/src/services/competition/types.ts` exporting `CompetitionId` (`'FMP' | 'FGP'`), `CompetitionConfig`, `Game`, `Team`, `Field`, `MatchesResponse`, and `CompetitionListItem` (the `/api/competitions` shape: `{ id, name }`).
- [x] 1.3 Create `api-app/src/services/competition/config.ts` exporting `COMPETITIONS: Record<CompetitionId, CompetitionConfig>` with FMP (`endpoint: 'https://sidgad.cloud/shared/portales_files/agenda_portales.php'`, `cliente: 'fmp'`, `idm: '1'`, `idTemp: '31'`, `name: 'Federación Madrileña de Patinaje'`) and FGP (`cliente: 'fgpatinaxe'`, otherwise identical).

## 2. Backend: shared parser

- [x] 2.1 Create `api-app/src/services/competition/parser.ts` exporting `parseFilaAgenda($: cheerio.CheerioAPI, el: any): Game` that reads `childNodes[3]`, `[5]`, `[7]`, `[11]`, `[15]`, `[19]`, decodes HTML entities via `he.decode`, trims the location, and resolves the map from a `LOCATION_MAP` constant copied from `web-app/src/constants/locations.ts`.
- [x] 2.2 Export `parseAgenda(html: string)` returning `{ teams: Set<string>, fields: Map<string, string>, matches: Game[] }` — iterate every `tr.fila_agenda`, call `parseFilaAgenda`, accumulate teams and fields, return the same shape `web-app` already exposes.

## 3. Backend: per-competition fetchers

- [x] 3.1 Create `api-app/src/services/competition/fmp.ts` exporting `fetchFmpMatches(): Promise<{ teams: Set<string>, fields: Map<string, string>, matches: Game[] }>` that POSTs `cliente=fmp&idm=1&id_temp=31` via axios + FormData to the sidgad endpoint and pipes the response through `parseAgenda`.
- [x] 3.2 Create `api-app/src/services/competition/fgp.ts` mirroring the FMP fetcher but with `cliente=fgpatinaxe`.

## 4. Backend: dispatcher and clubs layer

- [x] 4.1 Create `api-app/src/services/competition/dispatcher.ts` exporting `fetchCompetitionMatches(id: CompetitionId)` that switches on the id and calls the matching fetcher; throw a typed error if the id is not in `COMPETITIONS`.
- [x] 4.2 Create `api-app/src/services/competition/clubs.ts` exporting `getClubName(code: number): string` by reading the static `CLUBS` array (copy the relevant entries from `web-app/src/constants/clubs.ts`) so the API can return a human-readable club name without a DB hit. Throw a `ClubNotFoundError` for unknown codes.

## 5. Backend: routes

- [x] 5.1 Add `GET /api/competitions` in `api-app/src/app.ts` returning `Object.values(COMPETITIONS).map(({ id, name }) => ({ id, name }))`.
- [x] 5.2 Add `GET /api/matches` in `api-app/src/app.ts` reading `competition` and `club` query params; on a missing `competition` respond `400`, on a missing `club` respond `400`, on an unsupported `competition` respond `400`, on an unknown `club` respond `404`; otherwise return `{ competition, club: { code, name }, teams, fields, matches }` after running the dispatcher + applying the existing alias-matching filter (`isClubMatch` logic copied from `web-app/src/services/fmp.ts`).
- [x] 5.3 Verify `npm run build` in `api-app/` passes.

## 6. Smoke-test the API

- [x] 6.1 Start the api-app (`npm run dev` in `api-app/`) and `curl http://localhost:3001/api/competitions` — expect a JSON array containing both `FMP` and `FGP`.
- [x] 6.2 `curl 'http://localhost:3001/api/matches?competition=FMP&club=411'` — expect a non-empty `matches` array filtered to `TISO PATIN`.
- [x] 6.3 `curl 'http://localhost:3001/api/matches?competition=FGP&club=411'` — expect a `competition: "FGP"` response, sourced from the FGP upstream feed (different match list than FMP).
- [x] 6.4 `curl 'http://localhost:3001/api/matches?competition=NOPE&club=411'` — expect HTTP 400.
- [x] 6.5 `curl 'http://localhost:3001/api/matches?competition=FMP&club=999999'` — expect HTTP 404.

## 7. Web app: stop calling sidgad

- [x] 7.1 In `web-app/src/constants/competitions.ts`, remove the `endpoint`, `idm`, `idTemp` fields from the `Competition` type and from each entry; leave `id` and `name` only.
- [x] 7.2 Rewrite `web-app/src/services/fmp.ts` as `web-app/src/services/api.ts` exporting `getCompetitions(): Promise<CompetitionListItem[]>` and `getMatchesForClub(competition: CompetitionId, clubCode: number): Promise<MatchesResponse>`. Both functions fetch from `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}`.
- [x] 7.3 Update every import of the old `services/fmp` in `web-app/` to import from `services/api` instead.
- [x] 7.4 Verify the shipped `web-app/.next` (or `dist/`) bundle no longer contains the literal `sidgad.cloud/shared/portales_files/agenda_portales.php` string (`rg sidgad.cloud web-app/.next` returns no results, or equivalent).
- [x] 7.5 Update `web-app/.env.local.example` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` and document the new env var in `web-app/README.md`.

## 8. Web app smoke-test

- [x] 8.1 With `api-app/` running on :3001, run `npm run dev` in `web-app/`. The competition chip selector shows both `FMP` and `FGP`.
- [x] 8.2 Selecting FMP and opening Calendario with club `411` shows the FMP matches list (no network errors).
- [x] 8.3 Switching to FGP and opening Calendario with club `411` shows the FGP matches list.
- [x] 8.4 Reload the page after each switch — the chip persists via `localStorage` and the Calendario renders without a flash of empty state.

## 9. Documentation

- [x] 9.1 Append a short "Adding a new competition" section to `api-app/README.md` describing the one-line addition to `COMPETITIONS` in `api-app/src/services/competition/config.ts`.
- [x] 9.2 Add an "API dependencies" paragraph to `web-app/README.md` documenting that `web-app/` now requires `api-app/` to be running and how to override the base URL via `NEXT_PUBLIC_API_BASE_URL`.

## 10. Final verification

- [x] 10.1 `git status` shows changes only under `api-app/`, `web-app/`, and `openspec/changes/add-fgp-competition-web-api/`. `client-app/` is byte-identical to `HEAD`.
- [x] 10.2 `openspec validate add-fgp-competition-web-api --strict` passes.