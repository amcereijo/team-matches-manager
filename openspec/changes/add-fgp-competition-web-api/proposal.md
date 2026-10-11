## Why

The web app (`web-app/`) and the future mobile app share a competition-driven matches API, but only the Federación Madrileña de Patinaje (FMP) is wired up. Users who follow clubs from the Federación Gallega de Patinaxe (FGP) — whose public site is `https://www.competiciones.fgpatinaxe.gal` — have no way to view their team's upcoming matches in the tool. Adding FGP as a second supported competition removes that gap and lets the API and web app support multi-federation out of the box.

## What Changes

- Add a new `competition` value `FGP` in the shared competitions catalogue, backed by the public sidgad endpoint `https://sidgad.cloud/shared/portales_files/agenda_portales.php` with form fields `cliente=fgpatinaxe`, `idm=1`, `id_temp=31` (verified live; same endpoint and same `childNodes[3,5,7,11,15,19]` row layout as FMP).
- Promote the upstream fetcher from the web app into the `api-app/` backend so both surfaces (and any future mobile app) go through one server-side integration. The web app stops calling `sidgad.cloud` directly and starts calling the local API.
- Expose two new endpoints on `api-app/`:
  - `GET /api/competitions` → list of supported competition ids and display names.
  - `GET /api/matches?competition=<id>&club=<code>` → the same `{ teams, fields, matches }` shape the web app already returns today, now sourced from either FMP or FGP.
- Update `web-app/` to call the new `/api/competitions` and `/api/matches` endpoints instead of POSTing to sidgad directly. The existing competition-aware behaviour (selection chip, `tmm.web.selectedCompetition` localStorage key) stays.
- Drop the FGP-specific id (`411` / `tiso` / `tiso` mobile-only credentials flow stays untouched in `client-app/`; the web app already accepts any club from the catalogue).

## Capabilities

### New Capabilities
- `competition-matches-api`: the api-app endpoints that proxy the public sidgad competition endpoint, parse the agenda HTML, and return a normalized matches payload. Single capability covering both FMP and FGP; per-competition differences (cliente value, idm, id_temp) live in a config map, not in separate capabilities.

### Modified Capabilities
<!-- None. The repo has no existing `openspec/specs/` capability whose requirements change; `clubs-auth` deals with credentials and is unrelated. -->

## Impact

- `api-app/` gains two new HTTP routes and a new `services/competition/` module (`fmp.ts`, `fgp.ts`, plus a thin dispatcher). No new runtime dependencies — `axios` and `cheerio`/`he` are added as `dependencies`. The existing sqlite/TypeORM stack is untouched.
- `web-app/` loses direct knowledge of sidgad: `web-app/src/services/fmp.ts` is rewritten to read `/api/competitions` and `/api/matches` instead of POSTing upstream. `web-app/src/constants/competitions.ts` shrinks to the id list (no endpoints).
- One new env var: `API_BASE_URL` for the web app (defaults to `http://localhost:3001` in dev). README updates for both `api-app/` and `web-app/` document the new flow.
- Mobile (`client-app/`) is **not** modified in this change. It keeps its own FMP-only path. A follow-up change can point it at the new API once the team is ready to retire the duplicate parsing.