## Context

`web-app/` currently proxies to `api-app/` (Express) for `/api/matches`, which in turn hits sidgad. The user wants to remove the proxy hop and let the web-app scrape sidgad directly. The web-app is already a Next.js server (server components + API routes), so server-side scraping is the same pattern `web-app/src/services/fmp.ts` at `HEAD` used before the `add-fgp-competition-web-api` change.

`api-app/` is an Express + TypeORM + sqlite stack that was hosting only `GET /` and `GET /clubs` before this round of changes. The new layer (`/api/competitions`, `/api/matches`, the `services/competition/` tree) was added in the previous change. Removing it restores the api-app to its pre-change shape.

The FGP club catalogue added in `populate-fgp-clubs-from-agenda` lives in `web-app/src/constants/clubs.ts` and is orthogonal to this revert — the web-app's login flow and Calendario still need it.

See `proposal.md` for motivation; this change has no spec-level delta (`skip_specs: true`).

## Goals / Non-Goals

**Goals:**
- Web-app scrapes sidgad directly, with one fetcher per competition (`fmp.ts` for FMP, `fgp.ts` for FGP) so each can use the right `cliente` value.
- Drop the api-app competition layer and the new deps.
- Drop the web-app's `services/api.ts` and the `/api/matches` Next.js route.
- Drop the `NEXT_PUBLIC_API_BASE_URL` env var from `.env.local.example` and the README.

**Non-Goals:**
- Touching `client-app/`.
- Refactoring how the FMP/FGP fetchers share code (a simple copy of the parser keeps the diff small).
- Removing the now-orphaned `competition-matches-api` spec file from the `add-fgp-competition-web-api` change tree (it never made it to `openspec/specs/`; dead documentation is harmless).

## Decisions

### D1. Two parallel fetchers (fmp.ts + fgp.ts) rather than a dispatcher
- **Rationale:** FMP and FGP differ in `cliente` and HTTP method (FMP uses POST with form body — the original; FGP uses GET with query string — verified to work and what we just landed in the api-app). Two small files keep each readable and align with the `web-app/src/services/fmp.ts` at `HEAD` shape the user is reverting to.
- **Alternative considered:** Single `getMatches(competition, clubCode)` dispatcher. Saves a few lines but the per-competition divergence (POST vs GET) makes it less clear.

### D2. Restore `web-app/src/services/fmp.ts` to its `git show HEAD` content
- **Rationale:** The user explicitly said "auto-content" and pointed out the regression. The cleanest revert is to use the exact pre-change file content as the source of truth, rather than re-deriving it.
- **Alternative considered:** Re-derive by hand. Risk of accidental drift; the git history is the truth.

### D3. Drop the api-app competition layer entirely
- **Rationale:** Leaving dead code in `api-app/` invites confusion. The user picked "full revert of api-app layer" — clean removal.
- **Alternative considered:** Leave the api-app endpoints in place. The web-app no longer calls them, but they remain as a public surface. Not what the user asked for.

### D4. Drop the `NEXT_PUBLIC_API_BASE_URL` env var
- **Rationale:** Once the web-app no longer calls api-app, the env var is unused. Remove from the example and the README. Existing `.env.local` files keep their value harmlessly (Next.js only loads env vars that the code reads).
- **Alternative considered:** Leave the env var in place for future use. Adds noise; not worth it.

## Risks / Trade-offs

- **sidgad in the browser-adjacent stack** → The web-app is server-rendered (Next.js), so sidgad is called from the server, not the browser. CORS isn't a concern.
- **Two fetchers to maintain** → If sidgad changes the row layout, both fetchers need updates. Mitigation: the parser logic is the same; only the upstream call differs.
- **Lost mobile-app target** → `api-app/` no longer exposes a matches endpoint. The mobile app can't migrate to it (the previous change framed this as a follow-up). Mitigation: a future change can re-introduce the api-app layer when the mobile team is ready to migrate.

## Migration Plan

1. Land the revert in this order: api-app first (delete competition layer, drop deps), then web-app (restore fmp.ts, add fgp.ts, drop api.ts, drop /api/matches route, restore competitions.ts).
2. Verify `npm run build` (api-app) and `npm run build` (web-app) both pass.
3. Smoke-test: start web-app only (no api-app needed), open `/calendario` for an FMP club — matches render. Switch to FGP club — matches render. The `ECONNREFUSED` symptom from before is gone.
4. Rollback: archive this change. The previous (api-app-proxied) state is still in git history.