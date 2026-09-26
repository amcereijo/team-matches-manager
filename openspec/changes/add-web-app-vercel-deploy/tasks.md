## 1. Bootstrap the web-app project

- [x] 1.1 Create the `web-app/` directory at the repository root with a Vite + React + TypeScript scaffold (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`).
- [x] 1.2 Add the runtime dependencies declared in `design.md` Decisions D2 / D3 / D4: `react`, `react-dom`, `react-router-dom`, `axios`, `cheerio`, `he`. Add TypeScript dev dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node`.
- [x] 1.3 Add `.gitignore` entries under `web-app/` for `node_modules/` and `dist/`, and ensure the repo-root `.gitignore` does not exclude them globally.
- [x] 1.4 Add `web-app/README.md` covering `npm install`, `npm run dev`, `npm run build`, and the `vercel deploy` step (link to Vercel Vite preset, no custom config required).

## 2. Shared utilities

- [x] 2.1 Create `web-app/src/constants/clubs.ts` with the `ClubType` type and the `CLUBS` array copied from `client-app/constants/clubs.ts` (and the `CLUBS_MAP` derived from it).
- [x] 2.2 Create `web-app/src/constants/locations.ts` with the `LOCATION_MAP` copied verbatim from `client-app/constants/locations.ts`.
- [x] 2.3 Create `web-app/src/services/storage.ts` exposing `getItem`, `setItem`, `removeItem` that wrap `window.localStorage` and return `Promise<string | null>` / `Promise<void>` to mirror `AsyncStorage`.
- [x] 2.4 Create `web-app/src/services/team.ts` with `getClub`, `getClubName`, `getClubCode`, all backed by `services/storage.ts` (mirrors `client-app/services/team.ts`).

## 3. FMP matches service

- [x] 3.1 Create `web-app/src/services/fmp.ts` exposing `getMatches(clubCode)` that POSTs `multipart/form-data` (`cliente=fmp`, `idm=1`, `id_temp=31` — matching `client-app/services/fmp.ts` at `HEAD`) to `https://sidgad.cloud/shared/portales_files/agenda_portales.php` via `axios`, then parses with `cheerio` and returns a `Game[]` matching the mobile app's row-index logic.
- [x] 3.2 Smoke-test the FMP call against the public endpoint (development only) and confirm the row indices produce the same league / date / time / local / visit / location / map shape — verified with a one-shot `curl` against the live endpoint: 320 `fila_agenda` rows with the expected `childNodes[3,5,7,11,15,19]` mapping (league / date / time / local / visit / location).

## 4. Screens

- [x] 4.1 Create `web-app/src/services/whatsapp.ts` exposing `openWhatsapp(game)` that builds the same Spanish message template as `client-app/services/whatsapp.ts` and navigates to `https://wa.me/?text=<encoded>` (use `window.open` with `_blank` on desktop).
- [x] 4.2 Create `web-app/src/screens/LoginScreen.tsx` and `LoginScreen.module.css` — club `<select>`, username / password `<input>`s, error text, same hardcoded credentials (`tiso` / `tiso` / `411`).
- [x] 4.3 Create `web-app/src/screens/MainScreen.tsx` and `MainScreen.module.css` — welcome line with the club name and a "Cerrar sesión" button that clears login flag + club and navigates to `/login`.
- [x] 4.4 Create `web-app/src/screens/CalendarScreen.tsx` and `CalendarScreen.module.css` — calls `getMatches` with the logged-in club code, renders a loading state, an empty state, or a list of matches.
- [x] 4.5 Create `web-app/src/screens/MatchesTable.tsx` (table component used by CalendarScreen) — one row per match with league, formatted date/time (`es-ES`, `Intl.DateTimeFormat`), local vs visit, location, and the WhatsApp send button.
- [x] 4.6 Create `web-app/src/screens/SettingsScreen.tsx` and `SettingsScreen.module.css` — "Pantalla inicial" picker with the same three options (`Inicio`, `Calendario`, `Configuración`) whose value persists via `services/storage.ts`.

## 5. Routing and shell

- [x] 5.1 Create `web-app/src/router.tsx` (folded into `App.tsx`) with `/login` (public), `/`, `/calendario`, `/configuracion` (protected via `<Layout>`), and `*` fallback to a synchronous `RootRedirect` that reads `login` + `initialRoute` at render time.
- [x] 5.2 Implement the auth guard in `Layout.tsx` — synchronous `localStorage.getItem('login')` check at render time; if missing or not `'true'`, redirects to `/login` on the same paint (no async first render).
- [x] 5.3 Wire `App.tsx` to render `<RouterProvider>`. The initial-route resolution is now synchronous so reloads land on the right screen on the very first commit.

## 6. Local verification

- [x] 6.1 `npm install` and `npm run build` both pass; `dist/index.html`, hashed JS, CSS, and `favicon.png` are emitted cleanly.
- [ ] 6.2 Manual UI walk-through against `specs/web-client/spec.md`: scripted checklist lives in `web-app/UAT.md` and is up to the user to execute in their browser (login, failed login, Calendario render with and without matches, WhatsApp share, settings change, reloads, logout).
- [x] 6.3 Verified `client-app/`, `api-app/`, `deno-api-app/` trees are byte-identical to `HEAD`. (One pre-existing uncommitted edit to `client-app/services/fmp.ts` was present at session start; it has been reverted via `git checkout HEAD --` so the spec contract "no edits outside `web-app/`" holds.)

## 7. Vercel deployment

- [ ] 7.1 Run `vercel` from `web-app/` to create the project. Owns: the user — Vercel CLI requires the user's account login. Subsequent deploys and the staging URL are not under this tool's control.
- [x] 7.2 Added `web-app/vercel.json` with the SPA rewrite (`/(.*)` → `/index.html`) per Vercel's Vite SPA guide, so deep-link reloads work out of the box without a follow-up config change.
- [ ] 7.3 Promote to production (`vercel --prod`) and capture the final URL. Owns: the user. README has a placeholder section ready to be filled in once the URL is known.
