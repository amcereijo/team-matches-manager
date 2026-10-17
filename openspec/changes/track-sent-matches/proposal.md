## Why

Today the "Enviar" button on each match in `calendario/MatchesBoard` opens a `wa.me/?text=...` deep-link, but the web app has no memory of which matches the user has already shared. A match stays looking "unsent" until its date passes, even if the user clicked Enviar and posted the message in WhatsApp. We need a per-club, server-side record of which matches have been marked sent, surfaced in the UI so the user can see at a glance which ones they have already shared.

## What Changes

- Add server-side persistence for sent matches inside the **web-app** (no new backend process — keep the app self-contained as decided in `revert-competition-api-to-web-app`).
- Expose the upstream sidgad `param_game` game id on the `Game` type (it is already parsed in `fmp.ts` / `fgp.ts` for `localCode` / `visitCode` but the id segment is discarded) and use it — namespaced by competition — as the stable match identity for sent records. Fall back to a normalized composite tuple for rows where `param_game` is missing or malformed (consistent with the defensive posture in `match-filter-by-param-game`).
- Add two thin routes under `web-app/src/app/api/matches/sent/`:
  - `GET /api/matches/sent` — returns the current club's sent set as `{ sent: { [matchKey]: sentAt } }`.
  - `POST /api/matches/sent` — body `{ matchKey }`; idempotent insert; requires the match to be ready (`date` and a non-sentinel `time`).
- Render the Calendario page with the sent set already merged in (server-rendered initial state), so there is no "all unmarked → marked" flash.
- In `MatchesBoard`, replace the "Enviar" button on a sent, ready match with a "✓ Enviado" pill showing the sent-at date; mark the row visually (faded text + green accent border). Pending matches (no time) are not eligible — they keep today's "Pendiente" treatment and never expose a send button.
- Update the `ShareInfoPanel` copy so the user understands "Enviado" is recorded optimistically at the moment of clicking Enviar (we have no signal back from WhatsApp).

Optimistic click is the chosen honesty model: tapping Enviar records the match as sent regardless of whether the user actually completes the message in WhatsApp. No undo affordance is in scope.

Bulk marking is out of scope.

## Capabilities

### New Capabilities

- `match-send-tracking`: records when a club marks a match as shared via WhatsApp, exposes the per-club sent set to the Calendario UI, and renders sent matches distinctly. Covers identity, storage, the two API routes, the optimistic write on click, the server-rendered hydration, and the row visual treatment.

### Modified Capabilities

(none — no existing capability's REQUIREMENTS change.)

## Impact

- **New files** in `web-app/`:
  - `src/app/api/matches/sent/route.ts` (GET + POST)
  - `src/lib/server/sentStore.ts` (libSQL client + CRUD)
  - `migrations/0001_match_send_tracking.sql` (or equivalent table-init module) — schema for `match_send` table
- **Modified files** in `web-app/`:
  - `src/types/index.ts` — add `gameId: number | null` to `Game`
  - `src/services/fmp.ts`, `src/services/fgp.ts` — also surface `param_game` first segment as `gameId`
  - `src/app/(app)/calendario/page.tsx` — fetch the sent set server-side, pass to `MatchesBoard`
  - `src/app/(app)/calendario/MatchesBoard.tsx` — render sent state, optimistic write on click, `✓ Enviado` pill, faded styling
  - `src/app/(app)/calendario/calendario.module.css` — `.sentRow`, `.sentBadge`
  - `src/app/(app)/calendario/MatchesBoard.tsx` — `ShareInfoPanel` copy tweak
  - `package.json` — new libSQL client dependency (`@libsql/client`)
  - `web-app/.env.local.example` — `SENT_STORE_URL` and `SENT_STORE_AUTH_TOKEN` env vars
- **New infra**:
  - A libSQL database managed by the web-app server. In development it opens a local SQLite file (`file:./data/sent.sqlite`); in production it connects to a Turso remote database via `SENT_STORE_URL` + `SENT_STORE_AUTH_TOKEN`. The table is created lazily on first use with `CREATE TABLE IF NOT EXISTS`.
- **No new dev-process**: web-app remains the only server to run locally.
- **No cross-device sync work**: sent state is per-club only, but it does survive reloads and (via server-side storage) survive across devices for the same authenticated club.
- **Privacy**: `POST /api/matches/sent` requires a valid iron-session and uses `session.club.code` as the namespace — one club cannot read or write another's sent set.