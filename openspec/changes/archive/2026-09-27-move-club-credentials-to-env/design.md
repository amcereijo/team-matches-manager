## Context

Today the credential store is `web-app/src/constants/credentials.ts` — a `Record<number, { username, password }>` that gets built at module load by spreading one explicit override (`411 → tiso/tiso`) and then auto-filling every numeric key in `CLUBS_MAP` with `club<code>/club<code>`. That whole map ships in the Next.js bundle on every Vercel deploy. The same `tiso/tiso` pair is duplicated as constants in the Expo mobile app (`client-app/components/login-screen/LoginScreen.tsx`) and the mobile app authenticates by local string equality, not by calling the server. Vercel env vars and `process.env.*` reads already follow a known pattern in this codebase (`SESSION_PASSWORD` in `web-app/src/lib/session.ts:9-11`, `PORT` in `api-app/src/index.ts:5`, `DATA_BASE` in `api-app/src/config/db.ts:4`).

The web app exposes one canonical login endpoint at `POST /api/auth/login` (`web-app/src/app/api/auth/login/route.ts:5`) backed by iron-session via `getSession()` (`web-app/src/lib/sessionServer.ts`). The mobile app currently bypasses it. Vercel project-level env vars are the existing convention for any per-environment secret.

## Goals / Non-Goals

**Goals:**
- Move all per-club credential secrets out of source into a single Vercel env var.
- Keep behavior backward-compatible for the ~140 clubs on auto-derived `club<code>/club<code>` defaults so the change can ship without coordinated client rotation.
- Route the mobile app through the same `POST /api/auth/login` so any future rotation is server-side only.
- Fail closed: any malformed or wrong-shape env var behaves as if it were empty.
- No new dependencies, no DB schema changes, no session-format changes.

**Non-Goals:**
- Hashing passwords (bcrypt/etc). Plaintext compare against the env-var map is acceptable for this codebase's threat model — credentials never leave the server, never enter the bundle, and the bundle is no longer a credential leak. Hashing is a follow-up if/when clubs start authenticating user-by-user instead of club-by-club.
- Per-club password reset flows, self-service registration, or password expiry.
- Removing the unused `username` field on entries in `web-app/src/constants/clubs.ts` (dead code, but out of scope for a security-focused change).
- Changes to the Vercel deployment config beyond documenting the new env var.

## Decisions

### Env var name and shape: `CLUB_CREDENTIALS_JSON` as a single JSON map
- **Choice**: One env var, value is a JSON object whose keys are stringified numeric club codes and values are `{ username, password }`.
- **Rationale**: One env var means one rotation point per environment. JSON is the cleanest way to express N key/value pairs without an arbitrary naming convention (`CLUB_411_USER`/`CLUB_411_PASS` etc.) that would also need parsing/validation. Stores natively in Vercel's text-field env var UI.
- **Alternatives**:
  - One env var per club: rejected — too many env vars (140×3 envs), no real readability win, harder to audit.
  - Vercel KV / external secret store: rejected — overkill for a read-only auth table; adds latency and a new dependency.
  - JSON file in repo, gitignored: rejected — Vercel doesn't read random files; you'd still have to copy the file into the deploy, which is the same env var pattern with extra steps.

### Validator: strict at module load, fail closed
- **Choice**: Parse and validate `process.env.CLUB_CREDENTIALS_JSON` once at module load in `web-app/src/constants/credentials.ts`. Reject (a) anything that isn't an object, (b) any key that isn't a stringified integer, (c) any value that isn't `{ username: string; password: string }` with both non-empty. On rejection, treat as empty and log a single `console.warn` identifying that the value was rejected and why. Empty/missing is silent (no warning).
- **Rationale**: Fail closed means a malformed env var can never grant access to a club that should be locked out; it can only lock people out, which is the safer direction. Logging once at startup means ops sees a bad value on deploy without spamming logs at request time. Validating at module load (rather than per-request) avoids latency and is appropriate because the env var is immutable per process.
- **Alternatives**:
  - Per-request parsing: rejected — adds latency to every login and provides no correctness benefit since the env var doesn't change at runtime.
  - Schema library (zod/ajv): rejected — adds a dependency for a 5-line check.

### Where the override layer sits: merged on top of auto-derived defaults
- **Choice**: `findClubByCredentials()` continues to walk a single merged map. Defaults are still derived from `CLUBS_MAP` at module load. Env-var overrides are parsed once and merged in, taking precedence. Env-var entries for club codes that aren't in `CLUBS_MAP` are ignored (with a warning).
- **Rationale**: Preserves the current "every club can log in" behavior so no club is locked out by a missing env var. The env var is purely additive — overrides only. This matches the user-confirmed approach ("Keep default derivation, override only from env").
- **Alternatives**:
  - Require every club in env var: rejected per user decision; would lock out every club not yet listed.
  - Hash-and-salt in env var: rejected — JSON has no standard shape for it and would require a new code path in the consumer.

### Mobile auth: HTTP `POST` to the existing login endpoint, identical wire format
- **Choice**: `client-app/components/login-screen/LoginScreen.tsx` is rewritten. The `USER`/`PASSWORD`/`TEAM` constants are deleted. The submit handler posts `{ username, password }` to `${API_BASE}/auth/login` on the web app and treats `200` as success. Storage behavior (`AsyncStorage.setItem('login', 'true')` and `setItem('club', JSON.stringify(team))`) is preserved verbatim — the response body already contains the matched `club` object. `API_BASE` is an existing-or-to-be-added constant used by other mobile API consumers (`api-app` could be a longer-term home for the endpoints, but for this change we point at the web app because that's where `/api/auth/login` already lives and is already deployed on Vercel).
- **Rationale**: Both clients use one auth source means rotation only happens in Vercel. Mobile and web already share an iron-session via the cookie when on the same origin; the mobile app currently uses `AsyncStorage` because it's an out-of-browser client and doesn't have first-party cookie support for the web app's domain. We keep the AsyncStorage flag mechanism intact and trust the web app's response (treat any `2xx` as success; the server returns `200 { ok: true, club }` or `401 { error }`).
- **Alternatives**:
  - Build a new `/api/mobile-auth/login` that's a duplicate of the web endpoint: rejected — duplication invites drift.
  - Move login to `api-app/`: rejected — bigger scope (separate Vercel project, separate session format), and the spec is "move secrets to one server," not "redesign auth topology."

### `CLUB_CREDENTIALS_JSON` is a Vercel project env var, not a `vercel.json` mapping
- **Choice**: Document setting it in the Vercel UI for Production / Preview / Development. No `env` block added to `web-app/vercel.json`. Local dev uses `web-app/.env.local` (already gitignored).
- **Rationale**: Vercel project env vars are the standard place and are documented in the Vercel dashboard / API; committing them to `vercel.json` would either inline the secret or move the management problem into git.
- **Alternatives**: `.env.production` committed with placeholder + per-developer override — rejected; Vercel wouldn't actually load a `.env.production` from source at deploy time, this is a no-op pattern.

## Risks / Trade-offs

- [Plaintext passwords in env var] → The env var value is stored as plaintext in Vercel's secret store. Mitigation: Vercel encrypts env vars at rest and scoped by environment; only ops with dashboard access can read it. Adding bcrypt hashing is deferred as non-goal but would close this gap entirely when scope allows.
- [Validator runs at module load; an invalid value silently disables overrides] → Mitigation: a `console.warn` at startup prints a clear message; CI / smoke tests can hit `/api/auth/login` with the historically-implicit `tiso/tiso` after deploy and fail loudly if the env var is broken or missing.
- [Env var present but missing the `tiso` override on a deploy that lacks `tiso` locally] → Mitigation: README documents the minimum required entry (`{"411":{"username":"tiso","password":"<value>"}}`); rotation runbook in README explicitly calls out this entry.
- [Mobile app sending credentials over the wire] → Mitigation: deploy Vercel with HTTPS (already the default for Vercel); login is the only call that carries a password, and the response only carries the matched club, not the password.
- [Env-var size limit if this grows] → Vercel env-var limits are generous (≈64 KB per env var, ≈100 KB across all env vars per environment). Even 1000 clubs at ~50 bytes each is ~50 KB. Monitoring scope is fine for the current ~140 clubs; revisit if the table grows 10×.
- [Mobile session is `AsyncStorage` flag, not the iron-session cookie] → Pre-existing behavior; preserved as-is. Future work to share sessions across web and mobile is out of scope.

## Migration Plan

1. Implement the change locally with `web-app/.env.local` containing `CLUB_CREDENTIALS_JSON={"411":{"username":"tiso","password":"tiso"}}`.
2. Smoke-test locally: web login as `tiso/tiso` (club 411), and as `club332/club332` (default-derived). Run `npm run lint` / `npm run typecheck` from `web-app/`. Run `tsc --noEmit` (or equivalent) from `client-app/`.
3. Open the Vercel project, set `CLUB_CREDENTIALS_JSON` for Production, Preview, and Development, with at minimum the entry for club 411 using a rotated password. Save without redeploying other envs.
4. Deploy to a Preview branch; verify login against `tiso/<new password>` and one auto-derived club.
5. Promote to Production.
6. Mobile app: cut a new Expo build that includes the new `LoginScreen.tsx`. Push via EAS. Existing installed apps lose the ability to log in until updated (intentional — they no longer carry a working `tiso/tiso` since the server now requires whatever is in `CLUB_CREDENTIALS_JSON`).
7. Rotate: edit `CLUB_CREDENTIALS_JSON` in Vercel, save, redeploy. No code change.

**Rollback**: Revert the two code commits. Vercel keeps the env var; if a full revert is desired, delete `CLUB_CREDENTIALS_JSON` and redeploy — login falls back to auto-derived defaults for all clubs, and any club that had been relying on a custom cred still works as long as its old default hadn't been rotated. For the mobile side, the worst-case rollback is "users on the old version keep working until they update."

## Open Questions

None. The skipped `username` field on `CLUBS` in `web-app/src/constants/clubs.ts` is deliberately out of scope and can be cleaned up in a follow-up.
