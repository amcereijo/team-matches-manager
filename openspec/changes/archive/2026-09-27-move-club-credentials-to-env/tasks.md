## 1. Web app: env var parser and merged credential map

- [x] 1.1 In `web-app/src/constants/credentials.ts`, remove `BASE_CREDENTIALS` and the in-source `tiso/tiso` entry. Add a private `parseEnvOverrides(): Record<number, Credentials>` that reads `process.env.CLUB_CREDENTIALS_JSON`, parses it as JSON, validates each entry is a stringified integer key whose value is `{ username: string; password: string }` with both non-empty, and returns the validated map. On any failure (invalid JSON, wrong shape, wrong inner type), return `{}` and `console.warn` once with the failure reason.
- [x] 1.2 Replace the loop that builds `CLUB_CREDENTIALS` so it spreads the parsed env-var overrides on top of the auto-derived `club<code>/club<code>` defaults from `CLUBS_MAP`. Env-var entries for codes not in `CLUBS_MAP` are dropped with a `console.warn`.
- [x] 1.3 Leave the `Credentials` type, `findClubByCredentials` body, and exports unchanged. Add a JSDoc note on `findClubByCredentials` saying the credential sources are `process.env.CLUB_CREDENTIALS_JSON` overriding the auto-derived defaults.

## 2. Web app: login API stays the same; verify nothing else regresses

- [x] 2.1 Confirm `web-app/src/app/api/auth/login/route.ts` still imports `findClubByCredentials` and does not need any other change.
- [x] 2.2 Run `npm run lint` and `npm run typecheck` inside `web-app/` (or the equivalent command the project uses — check `package.json` scripts and confirm via `web-app/README.md`).
- [x] 2.3 Manual smoke test: with `web-app/.env.local` containing `CLUB_CREDENTIALS_JSON={"411":{"username":"tiso","password":"tiso"}}`, `POST /api/auth/login` with `{ "username": "tiso", "password": "tiso" }` returns `200 { ok: true, club: ... }` for club 411.
- [x] 2.4 Manual smoke test: with the same `.env.local`, `POST /api/auth/login` with `{ "username": "club332", "password": "club332" }` returns `200` for club 332 (auto-derived default still works).

## 3. Mobile app: stop carrying credentials locally, call the server

- [x] 3.1 In `client-app/components/login-screen/LoginScreen.tsx`, delete the `USER`, `PASSWORD`, and `TEAM` constants and the local-equality branch in `submit`.
- [x] 3.2 Add a small mobile API call (or reuse one if it exists). The handler should `POST { username, password }` to `${API_BASE}/auth/login` where `API_BASE` is a constant aligned with how the mobile app reaches the web app's API in other screens; if no such constant exists, add one at the top of the file or in `client-app/constants/` and document it in `client-app/README.md` if present. Treat any 2xx as success; non-2xx is a failure with the error message surfaced in the existing `error` state.
- [x] 3.3 On success, keep the existing `AsyncStorage.setItem('login', 'true')` and `AsyncStorage.setItem('club', JSON.stringify(<club>))` behavior and the navigation to `DrawerNavigator`. The matched `club` should come from the API response body, not from the local picker state.
- [x] 3.4 Run `tsc --noEmit` (or the project's equivalent) inside `client-app/` and confirm no type errors.

## 4. Documentation and env configuration

- [x] 4.1 In `web-app/README.md`, add a short "Club credentials" section that documents: the `CLUB_CREDENTIALS_JSON` env var name, the JSON shape, an example value, the fail-closed behavior on a malformed value, and a rotation runbook ("edit the value in Vercel, save, deploy").
- [x] 4.2 Add `web-app/.env.local.example` (committed, with placeholder values, no real secrets) documenting the env var alongside the existing `SESSION_PASSWORD` example, if such a file exists or if the README has an `.env.local` section that mirrors it. Skip if the README is the only env documentation.
- [ ] 4.3 In the Vercel project settings for the web app, set `CLUB_CREDENTIALS_JSON` for Production, Preview, and Development with at minimum `{"411":{"username":"tiso","password":"<rotated-value>"}}`. Do this step manually in the Vercel UI; do not paste any real secret into the repo or commit history.

## 5. Verification

- [x] 5.1 From `web-app/`, `rg "password\\s*[:=]\\s*['\\\"]"` against `web-app/src/` returns no matches in code files (test fixtures excluded if any).
- [x] 5.2 From `client-app/`, `rg "PASSWORD\\s*=\\s*['\\\"]|USER\\s*=\\s*['\\\"]"` returns no matches in `components/`.
- [ ] 5.3 Deploy a Preview build, hit `/api/auth/login` with the rotated `tiso` password, confirm 200. Hit it with a wrong password, confirm 401 with the documented error shape.
- [ ] 5.4 Cut an Expo build with the new `LoginScreen.tsx` and confirm login works against the Preview deploy.
