## Why

The two links the app puts into every WhatsApp convocatoria are long and carry the payload in the URL itself: `/c/<date-time>/<title>/<venue>` inlines the venue and the map link (~150 characters with the origin) and `/t/<competition>/<code>/<squad>` spells out the club and the squad. They are hard to read, easy to mangle when relayed, and impossible to revoke once a group has them. A short, opaque, app-owned link (`/link/<hash>`) stored in the app's existing per-club database fixes all three: the URL is short and stable, the identity it points at is revocable, and no third party sits in front of the player's tap.

A third-party shortener (short.io) was evaluated and rejected: it would put a vendor between the app and every player tap — capturing the recipient's IP and user agent, which the public pages explicitly refuse to do — adds a paid plan, an API key and an extra failure mode, and leaves the app unable to list or revoke its own links.

## What Changes

- Add a `links` table to the app's existing libSQL store, scoped per club the same way `match_send` is (club code + competition from the iron-session, never from the request body).
- Add a public, read-only `GET /link/[hash]` route that resolves a stored link and redirects (302) to the canonical page it points at. It never logs the requester's IP or user agent, never mutates server state, and returns a plain Spanish 404 page for an unknown or revoked hash.
- Add a session-protected API (`POST /api/links`, `GET /api/links`, `PATCH /api/links`) to create, list, disable and re-enable the club's links.
- Add a `/links` page in the admin area that lists the club's links, shows what each one points at, copies it to the clipboard, and lets the club disable or re-enable it. It also creates team-calendar links by hand.
- Two link kinds are supported, both of which resolve to the **existing** canonical pages: `team_calendar` → `/t/<competition>/<code>/<squad>` and `match_calendar` → `/c/<when>/<title>/<location>`.
- Change the "Enviar" flow so the convocatoria message carries short links when the link API answers, and falls back to the current canonical URLs when it does not. The Enviar button must never break because link creation failed.
- Add a nav entry for `/links` in the app shell.

**Not breaking:** the canonical `/c/...` and `/t/...` routes, their URLs, their pages and their specs are unchanged. Links already sent in a WhatsApp group keep working.

## Capabilities

### New Capabilities

- `short-links`: app-owned short links — the stored link record, the `/link/[hash]` resolver, the session-protected management API, the `/links` management page, and the automatic use of short links in the convocatoria message.

### Modified Capabilities

- `match-send-tracking`: the "Convocatoria includes a one-tap 'Add to calendar' link for ready matches" requirement changes — the message now carries a short link (`/link/<hash>`) resolved through the link store instead of the canonical path, with the canonical path kept as the fallback and as the link's target.

## Impact

- **New code**: `src/lib/server/linkStore.ts` (schema + CRUD), `src/app/link/[hash]/route.ts` (resolver), `src/app/api/links/route.ts` (management API), `src/app/(app)/links/` (page + client component + CSS), `src/lib/shortLink.ts` (hash alphabet, URL building, target derivation).
- **Changed code**: `src/app/(app)/calendario/MatchesBoard.tsx` (build the message from short links, with fallback), `src/components/Shell.tsx` (nav entry), `src/app/api/matches/sent/route.ts` (unchanged, but the Enviar click now issues one extra POST).
- **Storage**: one new `links` table in the same libSQL database already configured through `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN`. No new database, no new env var, no migration of existing data.
- **Dependencies**: none added. No third-party service, no SDK, no API key.
- **Public surface**: one new public route (`/link/[hash]`) that is anonymous, read-only and cacheable.
