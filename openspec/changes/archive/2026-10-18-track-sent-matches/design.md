## Context

The web-app (`web-app/`) is a Next.js 14 App Router app that fetches sidgad upstream HTML server-side, parses it into a `Game[]` per club, and renders the Calendario. The current `Game` shape (in `src/types/index.ts`) has no stable per-match id — `localCode`/`visitCode` exist but two clubs can play multiple times in a season, so they don't disambiguate. The upstream `param_game` attribute carries `<modality>_<round>_<localCode>_<visitCode>_<competitionId>` (five underscore-separated segments) and is partially parsed in `fmp.ts` and `fgp.ts` to extract `localCode`/`visitCode`; the competition-id segment is discarded.

The Calendario's `MatchesBoard.tsx` renders an "Enviar" link per row that opens `wa.me/?text=...` in a new tab. Today there is no server-side record of which matches have been shared.

The web-app already runs as a Next.js server with iron-session auth (`src/lib/sessionServer.ts` → `getCurrentClub()`). The api-app is a separate Express + TypeORM service that the web-app does not currently talk to (reverted in `revert-competition-api-to-web-app`).

See `proposal.md` for motivation, `specs/match-send-tracking/spec.md` for the behavioural contract.

## Goals / Non-Goals

**Goals:**
- Persist sent matches server-side, scoped to the authenticated club.
- Use the upstream sidgad `param_game` game id as the primary stable identity; provide a tuple fallback for rows where it is missing.
- Surface the sent state in the Calendario on first paint — no flash of unmarked-then-marked rows.
- Keep the web-app self-contained (one process, one `.env.local`, one `npm run dev`).

**Non-Goals:**
- Confirming actual delivery in WhatsApp — the optimistic model stands.
- An undo / "Desmarcar" affordance — not requested, not in scope.
- Bulk marking — explicitly excluded.
- Cross-process or cross-device sync of UI state — only the server-side sent set survives across devices (which is enough for the use case).
- Reusing the existing `api-app/` for persistence — would re-introduce the two-process dev setup that `revert-competition-api-to-web-app` removed.
- Migrating or backfilling data — there is no existing sent set to migrate.
- Exposing sent state outside the Calendario (no home-page widget, no settings-page toggle).

## Decisions

### D1 — Persistence lives inside web-app, not api-app

**Choice:** Add the sent-store as a server-side module in web-app (`src/lib/server/sentStore.ts`), opened from a Next.js route under `src/app/api/matches/sent/`.

**Why:** `revert-competition-api-to-web-app` deliberately removed the web-app → api-app coupling. Walking that back for a single feature would contradict a recent architectural decision. The web-app already has a server runtime with iron-session for auth — adding a small SQLite file alongside it is the path of least resistance.

**Alternatives considered:**
- *Use the existing api-app (TypeORM + SQLite):* rejected — re-introduces the two-process dev setup and adds a network hop on a button click.
- *Use iron-session to hold the sent set:* rejected — iron-session is signed/encrypted but the cookie has a 4 KB practical limit; sent sets grow over the season and the cookie would be re-sent on every request.
- *Use Vercel KV or another managed store:* rejected — adds an external dependency and a new Vercel-only billing surface for a feature that does not need global consistency.

### D2 — libSQL via `@libsql/client`

**Choice:** Use `@libsql/client` as the driver.

**Why:** The same package can open a local SQLite file in development (`file:./data/sent.sqlite`) and connect to a remote Turso/libSQL database in production. It uses a standard async SQL interface, has zero native build issues on Vercel, and is supported by Turso Cloud which this project already uses elsewhere.

**Alternatives considered:**
- *`better-sqlite3`:* rejected — native module; reliable on a single server but not on Vercel's ephemeral serverless filesystem because the SQLite file is not persisted across function invocations.
- *`@tursodatabase/serverless`:* considered, but `@libsql/client` is more familiar in the ecosystem and supports the same remote Turso URL with the same `fetch`-based transport when the URL is `https://` or `libsql://`.

The store connects lazily on first use. Environment variables:
- `SENT_STORE_URL` — database URL. Defaults to `file:./data/sent.sqlite` for local dev. In production set it to the Turso database URL (e.g. `libsql://my-db-org.turso.io`). If unset, falls back to `SENT_STORE_TURSO_DATABASE_URL` (the variable name Vercel's Turso integration populates by default).
- `SENT_STORE_AUTH_TOKEN` — Turso auth token. Required for remote URLs; ignored for local `file:` URLs. If unset, falls back to `SENT_STORE_TURSO_AUTH_TOKEN`.

The route module initialises the table on open with `CREATE TABLE IF NOT EXISTS …`.

### D3 — Match identity: composite key from `param_game` codes + date/time

**Choice:** The upstream `param_game` attribute's last segment is the competition id, not a unique fixture id. Derive `matchKey = "<competition>:<localCode>:<visitCode>:<date>:<time>"` when `localCode` or `visitCode` is non-null, else fall back to `matchKey = "tuple:<competition>:<club_code>:<local>:<visit>:<date>:<time>"`.

**Why:** Real sidgad data has only 41 distinct last-segment values across 1,689 FMP rows, so it cannot be a fixture id. The combination of (competition, local club code, visit club code, date, time) is unique per fixture in the rendered Calendario and survives date/time corrections better than team-name text. The fallback covers rows without `param_game`. Namespacing by `competition` keeps FMP and FGP id spaces separate.

**Alternatives considered:**
- *Pure composite tuple key on every match:* rejected — brittleness on time corrections means a marked match could "disappear" from the sent set after the federation updates the kickoff time.
- *Server-minted UUID minted on first sight:* rejected — requires persisting a `discovered_matches` table for every match ever rendered, which is out of proportion for v1.
- *Hash of (competition, param_game):* rejected — shorter but loses the human-readable upstream id without any practical benefit.

The `matchKey` is computed server-side in the Calendario page (right where matches are fetched) so both server-rendered HTML and client-side hydration agree on identity without re-deriving in the component.

### D4 — Server-rendered hydration, not client fetch

**Choice:** The Calendario page (`src/app/(app)/calendario/page.tsx`) reads the sent set inside the server component via `getSentForClub(club)` and passes it as a prop to `MatchesBoard`.

**Why:** Today `MatchesBoard` is `'use client'` but already receives `matches` as a prop from the server. Adding `initialSent` follows the same pattern and avoids a second round-trip on mount. The first paint is already in the correct state — no flash, no spinner.

**Alternatives considered:**
- *Client-side `useEffect` GET to `/api/matches/sent` on mount:* rejected — guarantees a visible flash of unmarked → marked rows on every page load.

### D5 — POST flow: window.open first, fetch second, optimistic state in between

**Choice:** In the click handler, the order is:
1. `window.open(wa.me/?text=..., '_blank')` — synchronous, in the user-gesture stack (required for mobile popup blockers).
2. `setLocalSent(matchKey, now)` — flip the row to sent state immediately.
3. `fetch(POST /api/matches/sent, { matchKey })` — fire-and-forget.

**Why:** Awaiting the fetch before `window.open` blocks mobile Safari's popup-permission prompt. Doing the fetch after the open keeps the user gesture intact. Doing the optimistic state flip before the fetch gives instant feedback.

**Failure handling:** if the POST rejects, the local flip stays for the current session — but the next page load will read the server state (which will be empty) and the row will go back to "Enviar". This is acceptable for the chosen "honesty model": the marker is the user's claim, not a server-confirmed fact.

### D6 — Idempotency on `(club_code, competition, match_key)` with earliest `sent_at` winning

**Choice:** Schema has `UNIQUE (club_code, competition, match_key)`. POST uses `INSERT … ON CONFLICT DO NOTHING` and returns the original `sent_at` (read after insert via a follow-up SELECT). Index on `(club_code, competition)` for the GET.

**Why:** The button can be tapped twice in a hurry, and a refresh right before the POST returns can race the optimistic state. Idempotency keeps the stored `sent_at` meaningful (always the first time the user marked it). SQLite's `ON CONFLICT` clause is the simplest way to express this in a single round-trip.

### D7 — Visual treatment: faded text, green accent, sent pill replaces Enviar

**Choice:** Sent ready rows get:
- `border-left: 3px solid #16a34a` (existing `--accent` family — or a new `--sent-accent` token; we will reuse existing tokens where possible)
- opacity `0.7` on `.matchTeams` and `.matchLeague`, faded text in `.matchMeta`
- a non-interactive `<span class="sentBadge">✓ Enviado · <date></span>` pill next to the still-visible "Enviar" button

**Why:** Matches the existing visual language (`.notReady`, `.zebra`, `.todayPill`) and reuses the same colour families. Keeping the Enviar button lets users re-share a match; the pill only signals that it has been marked sent before.

**Alternatives considered:**
- *Strikethrough on team names:* rejected — too aggressive; the user may want to re-read the date/time of a sent match.
- *Right-aligned "Sent" badge only, no row-level fade:* rejected — does not signal enough; users glancing through the list would still read each row as "needs attention".

### D8 — Optimistic click semantics documented in `ShareInfoPanel`

**Choice:** Add a one-sentence line to the existing info panel noting that the marker is recorded on click and that the app has no way to confirm the message was actually sent from WhatsApp.

**Why:** The user already raised this exact concern in the original brief. Documenting it in-app matches the chosen honesty model and prevents support confusion ("but I didn't send it!").

## Risks / Trade-offs

- **Turso database must be provisioned before production deploy** → Document the setup steps; the app will fail to connect on first request if `SENT_STORE_URL` + `SENT_STORE_AUTH_TOKEN` are missing in production.
- **Local dev data loss if the SQLite file is wiped** → Document `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN` in `.env.local.example`; the default local path (`file:./data/sent.sqlite`) writes to the gitignored `data/` directory.
- **Concurrent writes from two tabs of the same club** → libSQL/Turso serialises writes on the primary; the `INSERT OR IGNORE` + follow-up SELECT is correct under contention because `sent_at` is read after the insert returns.
- **Match id drift if sidgad changes its `param_game` schema** → The tuple fallback covers the missing/malformed case; if sidgad changes the segment order, our `localCode`/`visitCode` parsing would silently shift. Mitigation: a startup-time sanity log of the first parsed `param_game` value (one line at boot) so a regression is visible.
- **Optimistic semantics mislead users** → The info-panel sentence makes the model explicit; spec requires it (`Requirement: Optimistic semantics are documented in the UI`).
- **`gameId` collision if sidgad ever shares an id across FMP/FGP** → Mitigated by namespacing `matchKey` with the competition prefix (`FMP:99` vs `FGP:99`); the spec mandates this in `Requirement: A stable match key is derived for each match`.
- **Remote libSQL latency on the Calendario server render** → The sent set read is a single indexed `SELECT`; Turso is low-latency, but if it becomes a bottleneck the page could fallback to passing an empty set and hydrating client-side. This would trade the no-flash guarantee for resilience, which is not required in v1.
- **GDPR / data retention** → The store only contains opaque match identifiers (upstream ids and tuples) and a timestamp. No PII. No retention policy needed beyond the natural "past matches don't render".

## Migration Plan

No data migration — there is no existing sent set to migrate. Deployment is the standard Next.js redeploy. Rollback is a single revert of the change (no destructive schema change in the deploy window because `CREATE TABLE IF NOT EXISTS` is non-destructive). The new SQLite file is created lazily on first POST; an empty `match_send` table is harmless.

## Open Questions

None. All material decisions are captured above. The exact pill date locale format and the exact shade of green for the accent are cosmetic and can be tuned during implementation without changing the spec.