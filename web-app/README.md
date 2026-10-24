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

**Squad identity — team + league.** A club's team is identified by its name *and* its league: `DOMINICOS A` exists in ALEVÍN GRUPO A, INFANTIL GRUPO B, JUVENIL GRUPO B and SENIOR MASCULINO, and each of those is a different team with its own fixtures. The "Equipos" filter, the squad calendar link and the public `/t` page therefore all carry the league, and the filter prints it in the option label whenever the same name is used by more than one league. Squads are derived from the fixtures by the upstream club code first (the federation prints `DOMINICOS A` where the catalogue says `CLUB AA DOMINICOS`) and by the club's name aliases as a fallback.

## Routes

| Path              | Auth | Notes                                          |
| ----------------- | ---- | ---------------------------------------------- |
| `/login`          | —    | 3-step picker (competition → club → creds); redirects to `/` if already authed |
| `/`               | ✔    | Welcome screen + current competition           |
| `/calendario`     | ✔    | Teams / fields / matches                       |
| `/links`          | ✔    | Short links: create, copy, deactivate          |
| `/configuracion`  | ✔    | "Pantalla inicial" picker (localStorage)       |
| `/link/<hash>`    | —    | Public short-link resolver → `302` to the canonical page |
| `/c/[...]`        | —    | Public single-match landing page               |
| `/t/<comp>/<code>/<league>/<squad>` | — | Public squad calendar page (league-scoped) |

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
      links/
        page.tsx
        LinkList.tsx
    api/
      auth/
        login/route.ts
        logout/route.ts
        me/route.ts
      competitions/route.ts
      links/route.ts
    link/
      [hash]/route.ts
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
    calendarEvent.ts           # canonical /c and /t path builders
    calendarUrl.ts
    clubTeams.ts               # club/squad name matching
    shortLink.ts               # hash, short-link paths, canonical target derivation
    session.ts                # iron-session config
    sessionServer.ts          # server-only helpers
  lib/server/
    db.ts                     # shared libSQL client + schema bootstrap
    sentStore.ts              # sent-match store
    linkStore.ts              # short-link store
  services/
    competition.ts            # getMatchesForClub dispatcher (FMP/FGP)
    fmp.ts                    # FMP upstream fetcher (POST + cheerio)
    fgp.ts                    # FGP upstream fetcher (GET + cheerio)
    storage.ts                # client-only localStorage helper
  types/
    index.ts
```

## Hardcoded credentials

No credentials are hardcoded. See [Club credentials (env)](#club-credentials-env) — the source module `src/constants/credentials.ts` only merges auto-derived `club<code>` / `club<code>` defaults with whatever overrides `CLUB_CREDENTIALS_JSON` provides.## PWA / Install

The app is an installable PWA (manifest at `/manifest.webmanifest`, service worker `public/sw.js` generated by Serwist at build time, offline fallback `public/offline.html`).

- Regenerate icons from `public/favicon.png`: `npm run generate-pwa-icons` (writes `public/icons/`).
- Android/Chrome: Configuración -> "Instalar app". iOS Safari: Share -> "Añadir a la pantalla de inicio".
- The service worker is only active in production builds (`npm run build && npm run start`).

## Match-send tracking

The Calendario can remember which matches a club has already shared via WhatsApp:

- Tapping **Enviar** opens WhatsApp and marks the match as sent in a server-side store.
- Already-sent rows render a **"✓ Enviado · <fecha>"** pill instead of the Enviar button.
- The marker is optimistic: the UI flips immediately, then a `POST /api/matches/sent` persists it.

### Store backends

The store is implemented in `src/lib/server/sentStore.ts` and uses `@libsql/client`, which can talk to either a local SQLite file or a remote Turso/libSQL database depending on the env vars. The libSQL client itself (and the env-var fallback chain) lives in `src/lib/server/db.ts`, shared with the short-link store:

| Env var | Local dev | Vercel |
| ------- | --------- | ------ |
| `SENT_STORE_URL` | `file:./data/sent.sqlite` (default, lazy-created) | `libsql://<db>-<org>.turso.io` |
| `SENT_STORE_TURSO_DATABASE_URL` | leave unset | Fallback for `SENT_STORE_URL` (legacy Vercel Turso integration name) |
| `SENT_STORE_AUTH_TOKEN` | leave unset | Turso DB token |
| `SENT_STORE_TURSO_AUTH_TOKEN` | leave unset | Fallback for `SENT_STORE_AUTH_TOKEN` (legacy Vercel Turso integration name) |

Local dev writes to the gitignored `data/` directory. Production requires a Turso (or any libSQL-compatible remote) database.

### Setting up Turso for production

1. Install the Turso CLI (or use the web dashboard): `brew install tursodatabase/tap/turso`.
2. Authenticate: `turso auth login`.
3. Create the database:

   ```bash
   turso db create team-matches-sent
   ```

4. Get the connection URL and a token:

   ```bash
   turso db show team-matches-sent
   turso db tokens create team-matches-sent
   ```

5. Add both values to the Vercel project:

   - `SENT_STORE_URL` = the `libsql://…` URL (or use the Vercel Turso integration, which exposes `SENT_STORE_TURSO_DATABASE_URL` — both names are accepted)
   - `SENT_STORE_AUTH_TOKEN` = the generated token (or `SENT_STORE_TURSO_AUTH_TOKEN` if you go through the Vercel Turso integration)

6. Redeploy. The `match_send` and `link` tables are created automatically on the first request (`CREATE TABLE IF NOT EXISTS`).

### Setting up local development

No extra setup is required. The default config uses `file:./data/sent.sqlite`. If you want a different local path, set `SENT_STORE_URL` in `web-app/.env.local`, e.g. `SENT_STORE_URL=file:/tmp/sent.sqlite` (or set the fallback `SENT_STORE_TURSO_DATABASE_URL` — same effect).

## Short links

The two links the app puts into a WhatsApp convocatoria are long, and they carry their payload in the URL (`/c/<date-time>/<title>/<venue>` inlines the venue and its map URL). The app also owns a short, opaque, revocable name for each of them: `/link/<hash>`.

- **`<hash>`** — 8 random characters from the Crockford base32 alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, no `I`/`L`/`O`/`U`). It is random, not derived from the target: the target is drawn from a small public catalogue, so a derived hash would be enumerable by anyone who knows it.
- **`GET /link/<hash>`** — public, anonymous, read-only. It looks the hash up and answers `302` with the canonical path it points at (`/t/...` or `/c/...`). The canonical pages stay the source of truth; the short link only names one of them. An unknown, malformed or deactivated hash answers `404` with a plain Spanish page.
- **Privacy** — the resolver logs nothing about the requester (no IP, no user agent) and contacts no third party. It is strictly read-only: resolving a link writes nothing.
- **Storage** — the `link` table lives in the same database as the sent-match store (same `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN` vars, same local `data/sent.sqlite`). One row per club, per kind, per target, scoped by `club_code` + `competition`.
- **Idempotency** — asking twice for the same target returns the same hash and refreshes the stored parameters, so a corrected kickoff keeps the URL already pasted in the WhatsApp group. The kickoff time is deliberately not part of a target's identity; the fixture's date is.
- **Revocation** — a club deactivates a link from the **Links** page (`/links`) or via `PATCH /api/links`. A deactivated link is never handed out again: creating that target again mints a new hash, so a killed URL stays dead. Re-activating a link hands the target back to it.
- **Deactivation is not instant** — the redirect is cached for up to **5 minutes** (`Cache-Control: public, max-age=300`), so a deactivated link can keep resolving until that cache expires. The Links page says so next to the button.
- **API** — `GET` / `POST` / `PATCH /api/links`. All of them require the iron-session club and take it from `session.club`, never from the body. `POST` accepts a batch (`{ "links": [...] }`) so the Enviar flow needs one round trip for both kinds.

### The Enviar flow

When a club shares a match, the app asks the store for the two short links and puts them in the message. The request is capped at 2.5 s: if the store cannot be reached, times out or answers badly, the message is composed with the canonical `/c/...` and `/t/...` URLs instead and the conversation opens anyway. A failure in the link store never blocks a share.

The canonical URLs are unchanged by any of this — links already sent in a WhatsApp group keep working, and the app never depends on the store to render a page.

## Deploy

This is a standard Next.js app, so any platform that supports Node 18+ works (Vercel, Render, Fly, a Docker container, …). On Vercel the project is detected as "Next.js" with no extra config. The production deployment needs the sent-store environment variables configured as described above (`SENT_STORE_URL` + `SENT_STORE_AUTH_TOKEN`, or the equivalent Turso integration names `SENT_STORE_TURSO_DATABASE_URL` + `SENT_STORE_TURSO_AUTH_TOKEN`).
