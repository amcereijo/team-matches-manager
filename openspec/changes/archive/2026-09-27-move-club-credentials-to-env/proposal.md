## Why

Club login credentials — currently ~140 auto-generated `club<code>/club<code>` pairs plus a single hardcoded `tiso/tiso` admin override — live in `web-app/src/constants/credentials.ts` and ship in the Next.js bundle, and the same `tiso/tiso` is duplicated as constants in the Expo mobile app's `LoginScreen.tsx`. Once the app is deployed to Vercel, anyone with access to the JS bundle (or to the public GitHub repo) can read the full credential table. There is no hashing, no rotation path, and the mobile app carries its own copy of the secret with no way to push a rotation through it. We want the secrets out of source, behind a single env var, and both clients to authenticate against the same server endpoint so rotations only happen in one place.

## What Changes

- Introduce a single `CLUB_CREDENTIALS_JSON` env var holding a JSON map of club code → `{username, password}` overrides. The shape is documented and validated on read; a malformed value fails login closed.
- `web-app/src/constants/credentials.ts` stops defining `BASE_CREDENTIALS` and stops deriving `club<code>/club<code>` pairs at runtime. `findClubByCredentials()` now merges the parsed env-var overrides on top of the existing auto-derived defaults (no behavior change for clubs not in the env var) and compares inputs against that merged map.
- The same `POST /api/auth/login` route stays as the single authentication endpoint. Mobile clients no longer carry any credential constants; the Expo `LoginScreen.tsx` posts to that route like any other client and stores the resulting session the same way the web app does.
- Vercel project settings and a local `.env.local` example gain `CLUB_CREDENTIALS_JSON`. README documents the format and rotation steps. No secrets are added to source.

**BREAKING**: Club 411 (Tiso) admin login no longer accepts `tiso/tiso` unless that pair is present in `CLUB_CREDENTIALS_JSON`. Local dev needs a `.env.local` value to keep working. Existing clubs on the auto-derived `club<code>/club<code>` pairs continue to work unchanged; anyone who has rotated to a custom user/pass must keep that pair in the env var.

## Capabilities

### New Capabilities
- `clubs-auth`: Defines how clubs authenticate, where the credential source of truth lives, and how both web and mobile clients consume it.

### Modified Capabilities
- None. (This is the first spec for this area.)

## Impact

- `web-app/src/constants/credentials.ts` — rewritten to read `process.env.CLUB_CREDENTIALS_JSON` and merge with the existing `CLUBS_MAP`-derived defaults.
- `web-app/src/app/api/auth/login/route.ts` — unchanged externally; internally still calls `findClubByCredentials`.
- `web-app/src/lib/session.ts` — unchanged (already env-driven via `SESSION_PASSWORD`).
- `client-app/components/login-screen/LoginScreen.tsx` — `USER`, `PASSWORD`, `TEAM` constants and the local-equality branch are removed; the screen posts `username`/`password` to `${API_BASE}/auth/login` (via the existing mobile API client) and gates `AsyncStorage.setItem('login','true')` on a `200`.
- Vercel project: `CLUB_CREDENTIALS_JSON` must be set for production, preview, and development environments.
- `.gitignore`: already excludes `.env*.local`; no change.
- `web-app/README.md`: section added describing `CLUB_CREDENTIALS_JSON` format, an example, and rotation instructions.
- No new dependencies. No DB schema changes. No session-format changes.
