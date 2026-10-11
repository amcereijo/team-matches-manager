# Team Matches Manager — Web (Next.js)

Next.js 14 port of the Vite SPA. Same login → drawer → calendar → WhatsApp-share flow, now backed by a small server side that:

1. Handles **local user/password authentication per club** with cookie-based sessions (`iron-session`).
2. Exposes a **competition-driven matches API**. For each club we know its competition (FMP, FGP) and the web app's server side fetches / parses the upstream HTML directly, then returns the upcoming matches plus the catalogue of **teams** and **fields** for that competition.

## Stack

- Next.js 14 (App Router, React Server Components)
- React 18 + TypeScript
- `axios` + `cheerio` + `he` to parse the FMP and FGP upstream endpoints on the server (no CORS issues)
- `iron-session` for cookie sessions

## Develop

```bash
cd web-app
npm install
npm run dev          # http://localhost:3000
```

The session cookie is signed with `SESSION_PASSWORD` (set your own in `.env.local`, 32+ chars). A development-only fallback is baked into `src/lib/session.ts`.

## Build

```bash
npm run build        # next build
npm run start        # next start -p 3000
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
```

## Auth

- `POST /api/auth/login` — `{ username, password }`. Returns the club record; sets the session cookie.
- `POST /api/auth/logout` — destroys the session.
- `GET  /api/auth/me` — returns the current club or `null`.

Credentials are not stored in source. They come from the `CLUB_CREDENTIALS_JSON` env var (per-club overrides) layered on top of the auto-derived `club<code>` / `club<code>` defaults for every code in `CLUBS_MAP`. See [Club credentials (env)](#club-credentials-env) for the format and rotation instructions.

## Club credentials (env)

The web app reads club credential overrides from a single env var, `CLUB_CREDENTIALS_JSON`. The value is a JSON object keyed by composite `<competition>-<code>` pairs (e.g. `"FMP-411"`, `"FGP-411"`):

```jsonc
{
  "FMP-411": { "username": "tiso", "password": "<rotated-value>" },
  "FMP-332": { "username": "alcala", "password": "<rotated-value>" },
  "FGP-438": { "username": "artabros", "password": "<rotated-value>" },
  "FGP-162": { "username": "a-guarda", "password": "<rotated-value>" }
}
```

Rules:

- Keys MUST match `"FMP-411"` / `"FGP-411"` etc. — exactly `<FMP|FGP>-<digits>`. Bare numeric keys (`"411"`) are rejected with a warning, because sidgad reuses the same numeric code across FMP and FGP and a bare key would be ambiguous.
- Values MUST be `{ "username": string, "password": string }` with both non-empty.
- Anything else — invalid JSON, arrays, wrong inner types, malformed keys — is rejected at module load. On rejection the env var is treated as empty (**fail closed**: no override applies, auto-derived defaults still work) and a single warning is logged identifying the reason.
- Clubs not listed in the env var fall through to the auto-derived `club-<competition>-<code>` / `club-<competition>-<code>` default (e.g. `club-FMP-411` / `club-FMP-411`, `club-FGP-411` / `club-FGP-411`). Removing the env var entirely does not lock any club out.

### Local development

Set the value in `web-app/.env.local` (already gitignored) and restart `next dev`:

```bash
echo 'CLUB_CREDENTIALS_JSON={"FMP-411":{"username":"tiso","password":"tiso"},"FGP-438":{"username":"artabros","password":"artabros"}}' >> web-app/.env.local
```

### Vercel

In the Vercel project, set `CLUB_CREDENTIALS_JSON` for **Production**, **Preview**, and **Development** environments. At minimum include the TISO entry (`FMP-411`) so the historical admin login keeps working; add other clubs as they rotate off the `club-<competition>-<code>` default (e.g. `FGP-438` for HL NOROESTE with username `artabros`). Existing deployments using the old `"411"` numeric key shape must update to the composite `"FMP-411"` form when this change ships.

### Rotation

1. In Vercel → Project → Settings → Environment Variables, edit `CLUB_CREDENTIALS_JSON`.
2. Save (this triggers a redeploy).
3. No code change. Mobile clients automatically pick up the new credentials because they POST to `/api/auth/login` — the bundle no longer carries any secret.

To remove a club from the overrides (let it fall back to `club<code>`), delete that entry from the JSON. To rotate a single club's password, change just that entry's `password`.

## Competition-driven matches

- `GET /api/competitions` — list of supported competitions (`FMP`, `FGP`). Sourced from the static `COMPETITIONS` catalogue — no upstream call.
- The Calendario page calls the same server-side fetcher as the home page, dispatching to `services/fmp.ts` (FMP, POST with `multipart/form-data`) or `services/fgp.ts` (FGP, GET with query string) based on the logged-in club's competition. Both scrape `fila_agenda` rows with cheerio and return:

```jsonc
{
  "competition": "FMP",
  "club": { "code": 411, "name": "TISO PATIN" },
  "teams":   [{ "name": "ALAMEDA DE OSUNA" }, ...],
  "fields":  [{ "name": "POLID. MUNICIPAL ...", "map": "https://goo.gl/maps/..." }, ...],
  "matches": [{ "league": "...", "date": "13/03/2027", "time": null, "local": "...", "visit": "...", "location": "...", "map": "..." }, ...]
}
```

The Calendario page (`/calendario`) renders the three sections (Equipos / Pistas / Próximos partidos) directly from this payload. The "Enviar" button on each match opens a `wa.me/?text=...` deep-link with the same Spanish template used by the mobile app.

## Routes

| Path              | Auth | Notes                                          |
| ----------------- | ---- | ---------------------------------------------- |
| `/login`          | —    | 3-step picker (competition → club → creds); redirects to `/` if already authed |
| `/`               | ✔    | Welcome screen + current competition           |
| `/calendario`     | ✔    | Teams / fields / matches                       |
| `/configuracion`  | ✔    | "Pantalla inicial" picker (localStorage)       |

The auth guard lives in `src/app/(app)/layout.tsx` (server component) — it reads the session via `iron-session` and `redirect()`s to `/login` if no club is set.

### Login flow

1. **Competition** — picker over the registered competitions (`FMP`, `FGP`). The chosen id is persisted to `localStorage` under `tmm.web.selectedCompetition` and shown as a removable chip.
2. **Team** — picker over the clubs belonging to the selected competition. The chosen club is persisted as JSON under `tmm.web.selectedClub` and shown as a removable chip.
3. **Credentials** — username + password form. Only appears once a club is chosen. The "← Cambiar club" / "← Cambiar competición" links reset the relevant localStorage key and bounce back to the previous step.

Both `selectedCompetition` and `selectedClub` survive a reload — when you come back to `/login`, if both are set you land directly on the credentials step with the chips still in place. The chips each have an `×` button to clear that specific key.

## Folder layout

```
src/
  app/
    (app)/
      layout.tsx              # auth-guarded shell
      page.tsx                # /
      calendario/
        page.tsx
        MatchesBoard.tsx
      configuracion/
        page.tsx
        SettingsForm.tsx
    api/
      auth/
        login/route.ts
        logout/route.ts
        me/route.ts
      competitions/route.ts
    login/
      page.tsx
      LoginForm.tsx
      login.module.css
    globals.css
    layout.tsx
  components/
    Shell.tsx                 # drawer + logout
    Shell.module.css
  constants/
    clubs.ts
    locations.ts
    competitions.ts
    credentials.ts
  lib/
    session.ts                # iron-session config
    sessionServer.ts          # server-only helpers
  services/
    competition.ts            # getMatchesForClub dispatcher (FMP/FGP)
    fmp.ts                    # FMP upstream fetcher (POST + cheerio)
    fgp.ts                    # FGP upstream fetcher (GET + cheerio)
    storage.ts                # client-only localStorage helper
  types/
    index.ts
```

## Hardcoded credentials

No credentials are hardcoded. See [Club credentials (env)](#club-credentials-env) — the source module `src/constants/credentials.ts` only merges auto-derived `club<code>` / `club<code>` defaults with whatever overrides `CLUB_CREDENTIALS_JSON` provides.## Deploy

This is a standard Next.js app, so any platform that supports Node 18+ works (Vercel, Render, Fly, a Docker container, …). On Vercel the project is detected as "Next.js" with no extra config.
