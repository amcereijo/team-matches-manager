## Context

`web-app/` currently POSTs to `https://sidgad.cloud/shared/portales_files/agenda_portales.php` from the browser (see `web-app/src/services/fmp.ts`). The catalogue in `web-app/src/constants/competitions.ts` carries one competition (FMP) and one hard-coded upstream `endpoint`. There is no second competition wired in today.

`api-app/` is a small Express + TypeORM stack (`api-app/src/app.ts`) exposing only `GET /` and `GET /clubs`. It has the right shape — Express router, JSON middleware, TypeScript build — to host the new endpoints without touching the database layer.

The FGP public site (`https://www.competiciones.fgpatinaxe.gal`) sends `cliente=fgpatinaxe`, `idm=1`, `id_temp=31` to the same `sidgad.cloud/shared/portales_files/agenda_portales.php` endpoint that FMP uses. Verified live: 740 `fila_agenda` rows returned for FGP, with the same 12 `<td>` layout that FMP already parses via `childNodes[3,5,7,11,15,19]`.

See `proposal.md` for motivation; see `specs/competition-matches-api/spec.md` for the behaviour contract.

## Goals / Non-Goals

**Goals:**
- Promote the sidgad scraping into `api-app/` so both FMP and FGP share one parser.
- Add `GET /api/competitions` and `GET /api/matches` to `api-app/` with a single dispatcher that selects FMP vs FGP from a config map.
- Make `web-app/` talk only to `api-app/` (no direct sidgad calls in the browser bundle).
- Keep behaviour-compatible with today's web app response shape (`{ teams, fields, matches }`).

**Non-Goals:**
- Modifying `client-app/` (the React Native app keeps its in-app FMP path for now).
- Replacing cheerio with another HTML parser — cheerio is already proven in `web-app/` and the markup is simple.
- Adding auth to the new endpoints (same posture as the existing `/clubs` route).
- Server-side caching, rate limiting, or scheduled refresh of upstream data — out of scope for v1.

## Decisions

### D1. Move scraping into `api-app/` rather than add a second web-app fetcher
- **Rationale:** Two fetchers (one per competition) inside the web app would duplicate cheerio, `axios`, `he`, the row-index logic, and the location map. Centralising in `api-app/` removes the CORS-shaped concerns from the browser entirely (sidgad may tighten CORS at any time) and gives the mobile app a single target to migrate to later.
- **Alternative considered:** Add a `web-app/src/services/fgp.ts` mirroring `fmp.ts`. Cheaper change but locks the duplication in place and leaves sidgad in the browser.
- **Alternative considered:** Add a Vercel serverless proxy inside `web-app/` (mentioned in the existing `add-web-app-vercel-deploy` design). Same sidgad-in-browser problem; adds Vercel-only infra.

### D2. Per-competition config map keyed by competition id
- **Rationale:** A single `COMPETITIONS: Record<CompetitionId, { endpoint, cliente, idm, idTemp, name }>` map makes adding a third federation (RFEP, Basque, …) a one-line config change rather than a code change. The dispatcher reads `COMPETITIONS[competition]` and forwards `cliente` / `idm` / `id_temp` verbatim.
- **Alternative considered:** Class-per-competition with a `Competition` interface. More ceremony for the same outcome; a config map keeps the diff small for v1.

### D3. Keep `web-app/src/constants/competitions.ts` as the type registry, drop the endpoint
- **Rationale:** The web app still needs to know the competition ids (for the selector chip and for `localStorage` persistence). It no longer needs the endpoint — that knowledge moves to `api-app/`. The constant shrinks to `{ id, name }`; `CompetitionId` becomes `'FMP' | 'FGP'`.
- **Alternative considered:** Delete `web-app/src/constants/competitions.ts` entirely and let the web app infer ids from the `/api/competitions` response. Degrades the type story (`CompetitionId` becomes `string`) and complicates the static `localStorage` key.

### D4. Reuse the existing cheerio row parser as a shared helper
- **Rationale:** Both FMP and FGP return identical 12-cell `<tr class="fila_agenda">` rows. Extract `parseFilaAgenda($, el) → Game` into `api-app/src/services/competition/parser.ts`; FMP and FGP fetcher modules call it and only differ in how they hit sidgad.
- **Alternative considered:** Copy/paste the parser into each fetcher. Saves no lines and makes divergence (the kind of bug this design is trying to prevent) easier to introduce.
- **Alternative considered:** Type the parser against a generic `competition` parameter so it can stream different upstream shapes. Premature for v1: FGP and FMP use the same shape.

### D5. Web app reads `NEXT_PUBLIC_API_BASE_URL` for the api base
- **Rationale:** Next.js exposes only `NEXT_PUBLIC_*` env vars to the browser bundle. Default to `http://localhost:3001` for local dev so contributors don't need to set anything; production deploys set it in the Vercel project.
- **Alternative considered:** Hard-code `http://localhost:3001`. Breaks production.
- **Alternative considered:** Vercel rewrites (`/api/*` → api-app). Cleaner URLs but requires a second service the team doesn't operate yet.

### D6. Use a single cheerio instance per request, not a pool
- **Rationale:** Each `/api/matches` call fetches sidgad once and parses one HTML string; pooling cheerio adds complexity for no measurable gain at this volume.
- **Alternative considered:** Singleton cheerio. Already true given how cheerio works — `load(html)` is per-call; nothing to pool.

## Risks / Trade-offs

- **sidgad upstream changes** → If sidgad renames `fila_agenda` or shifts cell indices, both FMP and FGP break at once. Mitigation: the parser lives in one file and is unit-testable; a follow-up change can add a tiny smoke test that runs against the live endpoint in CI.
- **No request caching** → Every Calendario refresh hits sidgad. Acceptable for v1 (the page already polls on demand, not on a timer). Mitigation if it becomes a problem: add a per-competition in-memory cache keyed on `(competition, club)` with a 5-minute TTL.
- **`api-app/` becomes a hard dependency of `web-app/`** → Without the backend running, the web app shows "No se pudo cargar la agenda". Mitigation: surface a clear error and document `npm run dev` in both folders in the README.
- **Mobile app still talks to sidgad directly** → Two scraping paths exist temporarily (api-app + mobile). Mitigation: the new `api-app/` fetcher is the source of truth and the mobile team can migrate in a separate change.
- **FGP season selector not yet supported** → FGP currently only exposes `2020/21` (the default page). If a future season is added, the api-app config map needs a new entry. Documented in `api-app/README.md` so the operator knows where to extend it.

## Migration Plan

1. Land `api-app/src/services/competition/` (config, parser, fmp, fgp) plus the two new routes in `api-app/src/app.ts`. `npm run dev` from `api-app/` should answer `/api/competitions` and `/api/matches` on port 3001.
2. Update `web-app/src/services/fmp.ts` (rename to `api.ts`) to call the new endpoints, drop the sidgad URL. Update `web-app/src/constants/competitions.ts` to drop the `endpoint` field.
3. Add `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` to `web-app/.env.local.example` and to the Vercel project settings for production.
4. Smoke-test: open `web-app/` in dev with `api-app/` running, switch the competition chip between FMP and FGP, confirm both Calendarios render matches.
5. Rollback: revert the api-app routes (keep `/` and `/clubs`), revert `web-app/src/services/fmp.ts` to its previous version (or `git checkout HEAD -- web-app/`). No data loss; mobile unaffected.
6. Once stable, schedule a follow-up change that points `client-app/` at the same `api-app/` and deletes its in-app scraping.

## Open Questions

None. The only deferred item — migrating the mobile app — is explicitly a separate change (see Risks / Migration Plan).