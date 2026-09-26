## Context

The repository already contains three runnable apps: `client-app/` (Expo / React Native for Android and iOS), `api-app/` (Deno-based REST API), and `deno-api-app/` (a second Deno API). The user-facing surface today is the React Native app only. This change adds a fourth runnable surface: a browser-served, Vercel-deployable twin of `client-app/`, housed in a brand-new `web-app/` directory at the repo root. It must mirror the login → drawer → calendar → WhatsApp-share flow on web without touching any of the existing apps. See `proposal.md` for motivation; the behaviour contract lives in `specs/web-client/spec.md`.

## Goals / Non-Goals

**Goals:**
- Spin up a fully self-contained Vite + React + TypeScript project inside `web-app/`, deployable to Vercel with zero configuration beyond the framework preset.
- Ship the four screens from `client-app/` (login, Inicio, Calendario, Configuración) with the same Spanish copy and the same hardcoded credentials.
- Replace React Native primitives with web equivalents (HTML / `react-router-dom` / `localStorage`) so the bundle is plain JS that browsers can execute.
- Keep the FMP integration identical in behaviour (same endpoint, same form fields, same cheerio-based scraping).
- Persist login state and configuration in browser storage so reloads feel native.

**Non-Goals:**
- Touching any file outside `web-app/`, `.gitignore`, and any new repo-level docs.
- Adding a real auth provider (Clerk, Auth0, etc.) or hashing the hardcoded credentials.
- Adding PWA / service-worker / install prompts.
- Adding a Vercel serverless function as a proxy — if the FMP endpoint rejects CORS in production, that becomes a follow-up change.
- Sharing code between `client-app/` and `web-app/` via a workspace; both keep their own dependencies and copies of static data.

## Decisions

### D1. New folder `web-app/` with Vite instead of reusing `client-app/` Expo Web

- **Rationale:** The mobile app pulls `react-native`, `expo`, `@react-navigation/native`, and many native-only peers; bundling those into a Vercel deploy bloat and slows `npm install` for everyone. A standalone Vite project ships a plain React DOM bundle and keeps the two channels independent. The user picked this option explicitly.
- **Alternative considered:** Add a Vercel config to `client-app/` and use Expo Web. The mobile + web lockstep lives somewhere downstream the user did not want to commit to (sharing a `package.json`, etc.), and Expo Web's bundle for this app would carry every native dep.
- **Alternative considered:** Hybrid Vite + Expo monorepo (npm workspaces). Overkill for two consumers; defers the real win (shared components) for a later refactor.

### D2. Routing via `react-router-dom` instead of `@react-navigation/*`

- **Rationale:** `react-native` screens are bound to React Native's `View`/`Text`; rewriting them for the DOM keeps the screen logic visible but obviates `@react-navigation`. `react-router-dom` v6+ gives a near-identical `Routes` / `Outlet` API to what React Navigation gives today, so the navigation flow is recognisable.
- **Alternative considered:** Reimplement a tiny router by hand. Not worth the maintenance for three nested routes.

### D3. `localStorage` abstraction layer vs. inline `localStorage` calls

- **Rationale:** `client-app/` routes everything through `AsyncStorage`. To keep the call sites identical in shape, `web-app/src/services/storage.ts` exposes `getItem`, `setItem`, and `removeItem` with the same return types (`Promise<string | null>`, `Promise<void>`). The rest of the screens call the abstraction only.
- **Alternative considered:** Calling `window.localStorage` directly from each screen. Cheaper, but couples every screen to the browser API; if a future web follow-up wants IndexedDB or sessionStorage, every screen changes.

### D4. Same FMP endpoint, parsed with `cheerio` in the browser

- **Rationale:** The mobile app POSTs to `https://sidgad.cloud/shared/portales_files/agenda_portales.php` with the hardcoded `cliente=fmp`, `idm=1`, `id_temp=31` (matching `client-app/services/fmp.ts` at `HEAD`) and parses the returned HTML with `react-native-cheerio`. The web app does the same request with `axios` + browser `FormData`, parses with the standard `cheerio` package, and reuses the same row-index logic.
- **Alternative considered:** Build a thin Vercel serverless proxy to mask the public endpoint. Defers well; not needed for v1 unless CORS blocks the request in production (see Risks).
- **Alternative considered:** Cache the matches in `localStorage`. Out of scope for v1; matches are pulled on demand.

### D5. Inlined static constants (`CLUBS`, `LOCATION_MAP`) and hardcoded credentials

- **Rationale:** These values rarely change and never come from a server in the mobile app. Copying them into `web-app/src/constants/` keeps the web app deployable as a pure static bundle and avoids any new HTTP call for them.
- **Alternative considered:** Move them into `web-app/src/data/` shared with `client-app/`. Cross-folder imports violate the "no edits outside `web-app/`" constraint and add a workspace dependency.

### D6. Static CSS modules for screens instead of an exact port of `StyleSheet`

- **Rationale:** A pixel-exact port of every `StyleSheet.create({...})` from `client-app/` would sell "visual equivalence" without needing it; the spec only requires the same information hierarchy. Plain CSS modules per screen ship a small CSS file per route and let the browser cache them.
- **Alternative considered:** Tailwind or a UI library. Not yet in the repo, would add a build step and a config file the rest of the repo doesn't have.
- **Alternative considered:** Inline `style={{}}`. Closer to the mobile code, but harder to maintain; CSS modules win for one-screen-per-file readability.

### D7. Vercel deploy driven by Vite presets, not a custom `vercel.json`

- **Rationale:** Vite + React + TS is a Vercel first-class preset (`vercel-deploy-guides/vite`). Vercel infers `build` and `output` from the preset; no custom config is needed unless routing requires rewrites. The app uses client-side routing, but Vercel defaults to `index.html` for unknown routes via the preset, so SPA reloads work out of the box.
- **Alternative considered:** Hand-rolled `vercel.json` with explicit rewrites. Worth adding only if the preset is found insufficient during `vercel deploy` validation.

## Risks / Trade-offs

- **CORS on the FMP endpoint** → If `https://sidgad.cloud` blocks browser-origin requests, the Calendario screen will fail. Mitigation: surface a clear "No se pudo cargar la agenda" message and plan a follow-up change that adds a Vercel serverless proxy at `/api/matches`.
- **Hardcoded credentials in source** → Same as the existing mobile app. Acceptable for v1 because the credentials match the mobile app verbatim and the change ships a static bundle; rotating them is a separate change.
- **Data drift** between the web app's `CLUBS` / `LOCATION_MAP` copies and the mobile app's → Acceptable for v1; documented in the README so contributors know to update both. A future change could promote the constants into a shared package.
- **No offline support** → A reload with no network will load the cached bundle and hit the FMP error message. Acceptable for v1.
- **No automated deployment** in this change → Deployment is `vercel deploy` from a developer machine for the first run, after which Vercel's git integration can take over. Documented in `web-app/README.md`.

## Migration Plan

1. Land the `web-app/` folder with a Vite + React + TS scaffold matching the structure described in `tasks.md`.
2. Verify locally: `cd web-app && npm install && npm run dev` opens the app on `http://localhost:5173` and exercises every screen.
3. Run `vercel` from inside `web-app/` to create the Vercel project (accept the Vite preset). Confirm the production URL renders the login screen.
4. Rollback: remove the `web-app/` directory and (optionally) `vercel rm <project>` from the Vercel dashboard. No data loss, no impact on `client-app/` users.
5. After deploy, Vercel's optional "Git integration" can be enabled so future pushes to `main` redeploy automatically; turning that on is out of scope for this change.

## Open Questions

None. Specs and tasks cover the chosen scope; deferred items (CORS proxy, real auth, PWA) are explicitly out of scope and would warrant their own changes.
