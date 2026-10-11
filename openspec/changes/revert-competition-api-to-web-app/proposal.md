## Why

The `add-fgp-competition-web-api` change moved sidgad scraping from the web-app into the standalone `api-app/`. The user has now decided that the web-app should be self-contained again ("auto-content"): one process to run locally, no second port to remember. The web-app already runs as a Next.js server, so it can scrape sidgad directly on the server side — exactly what the Vite-era web-app did before, except now FGP is supported too.

## What Changes

- Restore `web-app/src/services/fmp.ts` to its `git show HEAD:web-app/src/services/fmp.ts` content (direct-to-sidgad POST with form-data, the original FMP scraper). Add a parallel `web-app/src/services/fgp.ts` that hits sidgad with `GET ?cliente=fgpatinaxe&idm=1&id_temp=31` and reuses the same parser logic.
- Delete `web-app/src/services/api.ts` and `web-app/src/app/api/matches/route.ts` (the Next.js route that proxied to api-app). Web-app pages call the fetchers directly again.
- Restore `web-app/src/constants/competitions.ts` to its `git show HEAD` content — bring back the `endpoint`/`idm`/`idTemp` fields per competition (FMP uses `cliente=fmp`, FGP uses `cliente=fgpatinaxe`).
- Drop the api-app competition layer: delete `api-app/src/services/competition/` and the `/api/competitions` + `/api/matches` routes from `api-app/src/app.ts`. Revert `api-app/src/index.ts` to `PORT || 3000` and drop `axios` / `cheerio` / `he` from `api-app/package.json`. `api-app/` is left with only its original `/` and `/clubs` routes.
- Update `web-app/README.md` to drop the "API dependency" section and the `NEXT_PUBLIC_API_BASE_URL` env var. Update `web-app/.env.local.example` to drop the same env var. FGP support shows up in the login flow and Calendario because the catalogue carries it; no extra infra is needed.
- Keep the FGP club catalogue additions from `populate-fgp-clubs-from-agenda` intact — those live in `web-app/src/constants/clubs.ts` and are still needed.
- The `competition-matches-api` spec created by `add-fgp-competition-web-api` is **not** archived. That change is in a `complete` state, but its delta specs were never promoted to `openspec/specs/` (they live in the change's `specs/` tree). After this revert, the api-app endpoints it described do not exist; the spec becomes dead documentation. We leave the file in place and rely on this change's `proposal.md` to document the behavioural intent.

## Capabilities

This change is a structural revert that brings the codebase back to its pre-`add-fgp-competition-web-api` shape (web-app is self-contained, api-app has only its original `/` and `/clubs` routes) plus the FGP catalogue additions from `populate-fgp-clubs-from-agenda`. It does not introduce or modify any spec-level behaviour contract. The change opts out of specs via `skip_specs: true`.

## Impact

- `web-app/` regains direct sidgad access. No second server to start during local dev.
- `api-app/` loses its competition-scrape layer and the new deps. Reverts to its pre-FGP state.
- `client-app/` is not modified in this change.
- No data migration. The `NEXT_PUBLIC_API_BASE_URL` env var becomes unused — drop from `.env.local.example` (existing `.env.local` files keep their value harmlessly).
- Rollback: archive this change. The web-app's previous state (with the api-app proxy) is still in git history.