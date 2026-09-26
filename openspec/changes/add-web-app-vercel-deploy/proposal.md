## Why

The product is currently only usable on mobile via the Expo / React Native app in `client-app/`. People who don't have the device install handy (a club manager's laptop, a coach checking the next match at a desktop) cannot use the tool. Adding a sibling web version that can be served from Vercel gives any user a browser the same login → calendar → WhatsApp-share flow they get from the native app, with no new backend work.

## What Changes

- Add a new `web-app/` folder at the repo root as a standalone Vite + React + TypeScript app that ships the same user flows as `client-app/`: login (club + username + password), drawer navigation (Inicio / Calendario / Configuración), the upcoming-matches table, and the "share via WhatsApp" action.
- Replicate only the behaviour, not the React Native code: replace `react-native` primitives with HTML, `@react-navigation/*` with `react-router-dom`, `AsyncStorage` with a `localStorage` abstraction, and `react-native-cheerio` + `Buffer` + `form-data` with `cheerio` + browser `FormData` for the FMP API call.
- Add a `vercel.json` (or rely on Vite defaults) plus a `README.md` so the app deploys to Vercel with `vercel deploy` and a single project setting (framework preset: Vite).
- No code changes inside `client-app/`, `api-app/`, or `deno-api-app/`. The web app talks to the existing public FMP endpoint the same way the mobile app does; no new server is introduced.
- Keep `CLUBS` and `LOCATION_MAP` constants inlined inside the web app for v1 (they are static); the hardcoded credentials (`tiso` / `tiso` / `411`) and the FMP form payload (`cliente=fmp`, `idm=1`, `id_temp=31`) match the mobile app's `HEAD` source so existing testers can sign in on web right away.

## Capabilities

### New Capabilities
- `web-client`: the browser-served, Vercel-deployable twin of the existing client experience (login, settings, calendar of matches, WhatsApp share). Establishes the user-facing behaviour for the web channel and gates the mobile app as the source of truth for shared business logic (club list, locations, message template, FMP endpoint).

### Modified Capabilities
<!-- None. The web app is a fresh capability; it does not change the requirements of any existing spec because the repository has no `openspec/specs/` content yet. -->

## Impact

- New folder `web-app/` (~ Vite scaffold + the screens above + a Vercel config). No source files outside that folder are edited.
- New top-level dev dependency footprint: Vite, React, react-router-dom, cheerio, axios, he, typescript — all installed inside `web-app/package.json`, isolated from `client-app/` and the existing root `package.json` (`api-app`-side workspace).
- No backend change. The web app POSTs directly to `https://sidgad.cloud/shared/portales_files/agenda_portales.php`; if that endpoint is CORS-restricted in production we may need a thin Vercel proxy in a follow-up change.
- No data migration. Users re-enter their credentials on the web app for the first time (or copy them from mobile — same hardcoded value).
- Out of scope: PWA install, push notifications, offline cache, multi-tenant auth, deep linking from WhatsApp back into the web app. Those can be follow-up changes.
