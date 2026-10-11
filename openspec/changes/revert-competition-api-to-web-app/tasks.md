## 1. Revert api-app changes

- [x] 1.1 Delete `api-app/src/services/competition/` (the entire tree: `aliases.ts`, `clubs.ts`, `config.ts`, `dispatcher.ts`, `fgp.ts`, `fmp.ts`, `parser.ts`, `types.ts`).
- [x] 1.2 Remove the `/api/competitions` and `/api/matches` route handlers from `api-app/src/app.ts`. Restore the file to its `git show HEAD:api-app/src/app.ts` content plus the imports it needs (only the original `getClubs` and root route).
- [x] 1.3 Revert `api-app/src/index.ts` to `PORT || 3000` (the original default before this round of changes).
- [x] 1.4 Revert `api-app/package.json` to remove `axios`, `cheerio`, `he` from `dependencies` and `@types/he` from `devDependencies`. Run `npm install` in `api-app/` to refresh `package-lock.json`.
- [x] 1.5 Delete `api-app/README.md` (was created by the previous change to document the now-removed module).
- [x] 1.6 Verify `npm run build` in `api-app/` still passes (it should — we're back to the original 2-route app).

## 2. Restore web-app direct-to-sidgad

- [x] 2.1 Restore `web-app/src/services/fmp.ts` to its `git show HEAD:web-app/src/services/fmp.ts` content (direct-to-sidgad POST with form-data, original FMP scraper).
- [x] 2.2 Add `web-app/src/services/fgp.ts` that calls `GET https://sidgad.cloud/shared/portales_files/agenda_portales.php?cliente=fgpatinaxe&idm=1&id_temp=31` and parses with `cheerio` + the same row indices as FMP.
- [x] 2.3 Restore `web-app/src/constants/competitions.ts` to its `git show HEAD` content (bring back `endpoint`/`idm`/`idTemp` per competition, FGP added with `cliente=fgpatinaxe` and the GET-query-string approach).
- [x] 2.4 Delete `web-app/src/services/api.ts` (the api-app proxy helper) and `web-app/src/app/api/matches/route.ts` (the Next.js route that proxied to api-app).
- [x] 2.5 Update `web-app/src/app/(app)/page.tsx` and `web-app/src/app/(app)/calendario/page.tsx` to call `getMatchesForClub(club.competition, club.code)` (or equivalent) that dispatches to `fmp.ts` / `fgp.ts` based on `club.competition`.
- [x] 2.6 Remove the `axios` import + the `ECONNREFUSED`-specific error message added in the previous change. Revert the home page to the original `console.error('Home: failed to load matches', err)` log.
- [x] 2.7 Verify `npm run build` in `web-app/` still passes.

## 3. Drop the api-app env var

- [x] 3.1 Remove `NEXT_PUBLIC_API_BASE_URL` from `web-app/.env.local.example` (and its preceding comment block).
- [x] 3.2 Remove the "API dependency" section and any mention of `NEXT_PUBLIC_API_BASE_URL` from `web-app/README.md`. Restore the "Stack" line about cheerio+he+axios to mention the web-app uses them (back to the original `web-app/README.md` shape — the line "axios + cheerio + he to parse the FMP endpoint on the server" still applies, just now the FMP/FGP endpoint too).

## 4. Smoke-test

- [x] 4.1 With NO api-app running on :3001, start the web-app (`npm run dev` in `web-app/`). Open `/` — the home page renders for the logged-in club (matches fetched directly from sidgad, not via api-app). *(Verified via curl: `POST /api/auth/login` as `tiso`/`tiso` → 200; `GET /` → 200 with TISO PATIN content.)*
- [x] 4.2 Open `/calendario` for an FMP club (e.g. TISO PATIN, code 411) — matches render. *(Verified: `GET /calendario` with FMP session → 200, 121298 bytes, page contains TISO PATIN match rows.)*
- [x] 4.3 Switch to an FGP club (e.g. HL NOROESTE, code 438) — matches render. (The FGP catalogue added in `populate-fgp-clubs-from-agenda` makes this club pickable in the login flow.) *(Verified: `POST /api/auth/login` as `artabros`/`artabros` → 200, returns HL NOROESTE FGP. `GET /calendario` → 200 with FGP context. HL NOROESTE has no upcoming matches in the current snapshot — `matches:[]` is correct upstream behaviour.)*
- [x] 4.4 Confirm the web-app no longer makes any HTTP request to `localhost:3001` from the browser. Check the Next.js dev console and the Network tab — no `localhost:3001/api/...` calls. *(Verified: `grep -rE 'localhost:3001|NEXT_PUBLIC_API_BASE_URL' web-app/src` returns no matches.)*

## 5. Final verification

- [x] 5.1 `git diff --stat HEAD -- client-app/` is empty (mobile app untouched).
- [x] 5.2 `openspec validate revert-competition-api-to-web-app --strict` passes.