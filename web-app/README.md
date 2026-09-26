# Team Matches Manager — Web (Next.js)

Next.js 14 port of the Vite SPA. Same login → drawer → calendar → WhatsApp-share flow, now backed by a small server side that:

1. Handles **local user/password authentication per club** with cookie-based sessions (`iron-session`).
2. Exposes a **competition-driven matches API**. For each club we know its competition (FMP for now) and the backend fetches / parses the upstream HTML, then returns the upcoming matches plus the catalogue of **teams** and **fields** for that competition.

## Stack

- Next.js 14 (App Router, React Server Components)
- React 18 + TypeScript
- `axios` + `cheerio` + `he` to parse the FMP endpoint on the server (no CORS issues)
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

Local credentials live in `src/constants/credentials.ts`:

| Club                 | Username      | Password      |
| -------------------- | ------------- | ------------- |
| TISO PATIN (411)     | `tiso`        | `tiso`        |
| ALCALA PA (332)      | `club332`     | `club332`     |
| ALCOBENDAS PA (328)  | `club328`     | `club328`     |
| … (every club)       | `club<código>` | `club<código>` |

The TISO row is the historical credential used by the mobile app; every other club auto-derives `club<code>` / `club<code>` so the table is fully usable out of the box.

## Competition-driven matches

- `GET /api/competitions` — list of supported competitions (FMP for now).
- `GET /api/matches` (auth required) — calls `getMatchesForClub` for the logged-in club. The backend POSTs `multipart/form-data` to the competition endpoint, scrapes `fila_agenda` rows with cheerio, and returns:

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

1. **Competition** — picker over the registered competitions (FMP for now). The chosen id is persisted to `localStorage` under `tmm.web.selectedCompetition` and shown as a removable chip.
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
      matches/route.ts
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
    fmp.ts                    # upstream fetcher
    storage.ts                # client-only localStorage helper
  types/
    index.ts
```

## Hardcoded credentials

The TISO default (`tiso` / `tiso`) matches the mobile app so existing testers can sign in immediately. For any other club, the credentials are `club<code>` / `club<code>`. Rotate them by editing `src/constants/credentials.ts`; the rest of the app reads through that single module.

## Deploy

This is a standard Next.js app, so any platform that supports Node 18+ works (Vercel, Render, Fly, a Docker container, …). On Vercel the project is detected as "Next.js" with no extra config.
