## 1. Identity: surface upstream game id

- [x] 1.1 Add `gameId: number | null` to the `Game` type in `web-app/src/types/index.ts`
- [x] 1.2 In `web-app/src/services/fmp.ts`, extend `readParamGameCodes` (or add a sibling helper) to also return `gameId` from `param_game` parts[0], and surface it on every pushed `Game`
- [x] 1.3 Apply the same change in `web-app/src/services/fgp.ts`
- [x] 1.4 Add a `matchKey` derivation helper in `web-app/src/lib/matchKey.ts` (`"<competition>:<gameId>"` when `gameId` non-null, else `tuple:<competition>:<club_code>:<local>:<visit>:<date>:<time>`)

## 2. Server-side sent store

- [x] 2.1 Add `@libsql/client` to `web-app/package.json` (and remove `better-sqlite3` / `@types/better-sqlite3`), then run `npm install`
- [x] 2.2 Update `web-app/src/lib/server/sentStore.ts` to connect via `@libsql/client`: local `file:./data/sent.sqlite` by default, remote Turso/libSQL when `SENT_STORE_URL` is set; create `match_send` if missing (`club_code INTEGER, competition TEXT, match_key TEXT, sent_at TEXT`, `UNIQUE(club_code, competition, match_key)`), and export `getSentForClub(club)` + `markSent(club, matchKey)` (idempotent via `INSERT … ON CONFLICT DO NOTHING` + follow-up SELECT) + `matchIsReady(match)` check
- [x] 2.3 Replace `SENT_STORE_PATH` with `SENT_STORE_URL` and `SENT_STORE_AUTH_TOKEN` in `web-app/.env.local.example` with comments explaining local vs production use
- [x] 2.4 Ensure `data/` is in `web-app/.gitignore` (add the line if not present)

## 3. API routes

- [x] 3.1 Create `web-app/src/app/api/matches/sent/route.ts` exporting `GET` and `POST` handlers
- [x] 3.2 `GET`: read club via `getCurrentClub()`; respond `401` if missing; otherwise return `{ sent: { [matchKey]: sentAt } }` from `getSentForClub(club)`
- [x] 3.3 `POST`: parse body `{ matchKey }`; respond `400` if missing; respond `401` if no club; call `markSent(club, matchKey)`; respond `200 { sentAt }`

## 4. Calendario page wiring

- [x] 4.1 In `web-app/src/app/(app)/calendario/page.tsx`, compute `sent` server-side from `getCurrentClub()` + `getSentForClub(club)`, and pass it as `initialSent` to `MatchesBoard`
- [x] 4.2 In `web-app/src/app/(app)/calendario/MatchesBoard.tsx`, accept `initialSent` as a prop, seed `useState` from it, and compute `matchKey` for every row using the new helper

## 5. UI: render sent state

- [x] 5.1 In `MatchesBoard.tsx`, replace the "Enviar" `<a>` with a "✓ Enviado · <date>" `<span>` for ready rows whose `matchKey` is in the local sent set; otherwise keep the Enviar link
- [x] 5.2 Update the click handler on "Enviar" so it (a) `window.open`s the WhatsApp URL synchronously, (b) optimistically flips local sent state for that `matchKey`, then (c) fires `fetch('POST /api/matches/sent', { matchKey })` without awaiting
- [x] 5.3 Add `.sentRow`, `.sentBadge` (and any supporting) styles to `web-app/src/app/(app)/calendario/calendario.module.css` (green accent border on the row, faded text, non-interactive pill)
- [x] 5.4 Extend `ShareInfoPanel` with one sentence explaining the optimistic model ("Enviado" is marked on click; the app cannot confirm actual delivery from WhatsApp)

## 6. Verification

- [x] 6.1 Manual: log in as a club, tap Enviar on a ready match → confirm row flips, refresh → still marked; tap again → `sent_at` unchanged
- [x] 6.2 Manual: log in as a different club → confirm sent marks from club A do not leak
- [x] 6.3 Manual: open Calendario with the network tab open → confirm there is no `GET /api/matches/sent` call on first paint (server-rendered state only)
- [x] 6.4 Manual: simulate `POST /api/matches/sent` 500 (e.g. with a temp throw) → confirm row stays marked in the current session; reload → row goes back to "Enviar"
- [x] 6.5 `npm run typecheck` and `npm run lint` pass; local libSQL file smoke test passes
- [x] 6.6 Confirm `data/sent.sqlite` (or the configured `SENT_STORE_URL`) is initialized on first POST and contains a single row per `(club, matchKey)` after multiple taps
- [x] 6.7 Updated `web-app/README.md` with Turso setup and env-var instructions