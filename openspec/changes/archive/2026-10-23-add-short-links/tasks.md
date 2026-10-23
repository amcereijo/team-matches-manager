# Tasks

> The three open questions in `design.md` (hand re-pointing a link, a manual match-link picker, vanity slugs) are deferrable: none of them changes the resolver, the API's shape or the specs, so they are not baked into this checklist.

## 1. Shared libSQL bootstrap (no behaviour change)

- [x] 1.1 Create `src/lib/server/db.ts` exporting a single lazily-created libSQL client plus the schema bootstrap: the `SENT_STORE_URL` → `SENT_STORE_TURSO_DATABASE_URL` → `file:./data/sent.sqlite` fallback chain, the `SENT_STORE_AUTH_TOKEN` → `SENT_STORE_TURSO_AUTH_TOKEN` fallback, the local-directory creation for `file:` URLs, and the `CREATE TABLE IF NOT EXISTS` for `match_send` (moved verbatim from `sentStore.ts`).
- [x] 1.2 Rewrite `src/lib/server/sentStore.ts` to use that module. Its table, its queries, its env-var resolution and its exported functions MUST be behaviourally identical — `match-send-tracking` is untouched by this step.
- [x] 1.3 Verify 1.1-1.2 by exercising the sent store end to end: mark a match sent, read the sent set back, confirm the row lands in the same `match_send` table with the same `sent_at` semantics (first mark wins, repeat mark is idempotent).

## 2. Link domain helpers

- [x] 2.1 Create `src/lib/shortLink.ts` with the Crockford base32 alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), an 8-character random hash generator backed by `crypto.getRandomValues`, and a normaliser that upper-cases a candidate hash and rejects anything containing a character outside the alphabet.
- [x] 2.2 In the same module, add the short-link path/URL builders: `/link/<hash>` and its absolute form built from `NEXT_PUBLIC_WEB_APP_URL` in production and `window.location.origin` in development — the same origin rule the existing calendar links use.
- [x] 2.3 Add the target-identity derivation: `team_calendar` → `<competition>:<club_code>:<squad>`; `match_calendar` → `<competition>:<club_code>:<date>:<local>:<visit>` (the kickoff time is deliberately NOT part of the identity — see design.md D5).
- [x] 2.4 Add the canonical-target derivation, which MUST reuse the path builders from `src/lib/calendarEvent.ts` so there is exactly one definition of each canonical path. `buildTeamCalendarUrl`/`buildCalendarUrl` were split into `buildTeamCalendarPath`/`buildCalendarPath` (the URL builders now delegate to them) so the store can derive a path without an origin. It takes the link kind and its stored parameters and returns the canonical path.
- [x] 2.5 Add the parameter derivation for each kind: for `team_calendar` the squad name; for `match_calendar` the fixture's date, time, venue text (with the map URL in parentheses, matching `locationText()`) and the opponent-derived title (matching `opponentFor()`), so the title is derived by the app rather than accepted from the client.

## 3. Link store

- [x] 3.1 Create `src/lib/server/linkStore.ts`. It MUST create its table lazily with `CREATE TABLE IF NOT EXISTS link (hash TEXT PRIMARY KEY, club_code INTEGER NOT NULL, competition TEXT NOT NULL, kind TEXT NOT NULL, target_key TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, disabled_at TEXT)` plus a **partial** unique index `idx_link_active_target` over the active rows only — see the revision note below.
- [x] 3.2 Implement `createOrReuseLink(club, kind, params)`: look the target up by `(club_code, competition, kind, target_key)` among the **active** rows; if one exists, refresh its `payload` and `updated_at` and return it; if the target's only row is deactivated, mint a NEW hash; if no row exists, insert one with a random hash, retrying on a hash collision.
- [x] 3.3 Implement `listLinksForClub(club)` returning the club's rows with hash, kind, payload, created/updated timestamps and active state — and nothing owned by another club.
- [x] 3.4 Implement `setLinkActive(club, hash, active)` which sets or clears `disabled_at`, and which MUST refuse to act on a hash owned by another club. Re-activating stands the other links for the same target down first, so a target has at most one active link.
- [x] 3.5 Implement `resolveLink(hash)`: normalise the hash, return `null` when it is malformed, unknown or deactivated, and otherwise return the link's kind and parameters. It MUST be strictly read-only — no row is written on a resolution.

> **Revision during apply (3.1).** The table-level `UNIQUE (club_code, competition, kind, target_key)` this task originally specified cannot hold the spec's three rules at once (at most one active link per target; a deactivated link is never re-issued; the deactivated row survives). It is now a partial unique index over the active rows only — `WHERE disabled_at IS NULL` — and the store copies the rows across when it finds a table left over from the earlier shape. Design.md D3 records the same revision.

## 4. Public resolver route

- [x] 4.1 Create `src/app/link/[hash]/route.ts` as a `route.ts` (not a `page.tsx`): no app chrome, no session read, no `<script>`, no subresource request.
- [x] 4.2 Resolve the hash through `resolveLink()`; on a malformed, unknown or deactivated hash respond HTTP 404 with a plain Spanish "este enlace ya no está disponible" page carrying `noindex`, naming no table, no club and no upstream host.
- [x] 4.3 On an active link, derive the canonical path from the stored parameters and respond `302` with that path in `Location`. The route MUST NOT render the target itself and MUST NOT contact any third party.
- [x] 4.4 Send `Cache-Control: public, max-age=300` on the redirect, and MUST NOT log or store the requester's IP, user agent or any other requester identifier.
- [x] 4.5 Confirm the resolver is read-only and idempotent: resolving the same link twice writes nothing and returns the same target.

## 5. Management API

- [x] 5.1 Create `src/app/api/links/route.ts` with `GET` (list), `POST` (create one or many) and `PATCH` (deactivate / re-activate). All three MUST return 401 without an iron-session club and MUST take the club from `session.club` — never from the body or the query string.
- [x] 5.2 `POST` MUST accept a batch (so the Enviar flow needs one round trip for both kinds) and MUST answer per item with the hash, the `/link/<hash>` path and the absolute URL. A body field naming a club MUST be **ignored, not honoured** — the row is written under the session club (the spec's "the body cannot spoof the owner" scenario; the wording "reject a body naming a club" in this task meant "refuse to act on it", not "fail the request").
- [x] 5.3 `PATCH` MUST act only on a link owned by the requesting club and MUST refuse otherwise.
- [x] 5.4 Verify the isolation rules with two clubs: club A's list contains no club B's link, and club A's deactivate attempt against club B's hash leaves it active.

## 6. The `/links` page

- [x] 6.1 Create `src/app/(app)/links/page.tsx` as a server component inside the protected layout: it MUST read the club from the session, load the club's links from the store and pass them to a client component. Anonymous requests MUST be redirected to `/login` by the existing protected layout.
- [x] 6.2 Create the client component `src/app/(app)/links/LinkList.tsx` (plus its CSS module) rendering, per link: what it points at (the squad for a team calendar, the fixture for a match), the short URL, its canonical target, its creation and last-update timestamps, and its active state.
- [x] 6.3 Add the copy action (short URL to the clipboard), the deactivate action and the re-activate action, each calling the management API and re-rendering from the response without a full page reload.
- [x] 6.4 Add the "create a team-calendar link by hand" form: a squad input whose suggestions come from the club's squads derived from the fixture data with the existing alias rules, accepting a hand-typed squad as well. The derivation was extracted to `squadsForMatches()` in `src/lib/clubTeams.ts` so the Calendario's filter and this picker share one definition.
- [x] 6.5 State the deactivation window next to the deactivate action (a deactivated link can keep resolving for up to the redirect's five-minute cache window), so the club is not misled.
- [x] 6.6 Add the nav entry `🔗 Links` to the `NAV` array in `src/components/Shell.tsx`, next to `Calendario` and `Configuración`, and confirm the active-link highlighting still works for the new route.

## 7. Enviar flow

- [x] 7.1 In `MatchesBoard.tsx`, turn the message builder into an async step: build the canonical `/c` and `/t` URLs as today, then POST to `/api/links` with both kinds in one request, capped at ~2.5 s. The WhatsApp tab is opened synchronously (on the user gesture, so the popup blocker still allows it) and pointed at `wa.me` when the links arrive.
- [x] 7.2 On a successful answer, swap in the two short URLs; on a failure, a timeout or a malformed answer, keep the canonical URLs. The conversation MUST open in every case, and no error may be shown to the club.
- [x] 7.3 Confirm the rest of the message is untouched: the `📅 Añadir al calendario:` and `📅 Calendario del equipo:` lines stay in their slots, separated by a blank line and above the `Porteros:` scaffold; the roster block is byte-for-byte identical; the `Enviado` POST to `/api/matches/sent` still fires optimistically and unchanged.
- [x] 7.4 Confirm the pending-match behaviour is unchanged: the add-to-calendar line is still omitted for a fixture with no confirmed kickoff, and the team-calendar line is still derivable.
- [x] 7.5 Confirm both emitted URLs contain no `&` or `?` characters and that the short URL is shorter than the canonical one it replaces.

## 8. Verification

- [x] 8.1 Type-check, lint and build pass with no new warnings.
- [x] 8.2 Run the app and open a real `/link/<hash>`: confirm it redirects to the canonical page, that the page renders exactly as the direct canonical URL does, and that the redirect carries the specified cache header.
- [x] 8.3 Confirm the response branches: a malformed hash → 404, an unknown hash → 404, a deactivated hash → 404, and each 404 body is the plain Spanish page with no script tag and no internal detail.
- [x] 8.4 Confirm the privacy contract: the resolver's implementation contains no log of the IP, the user agent or any other requester identifier, and resolution writes nothing to the store.
- [x] 8.5 Confirm idempotency: creating the same team-calendar link twice returns the same hash and leaves exactly one row; a corrected kickoff keeps the hash and refreshes the payload; a deactivated target yields a NEW hash and leaves the old one dead.
- [x] 8.6 Confirm the canonical routes are untouched: `/c/[...]` and `/t/[competition]/[code]/[squad]` still render exactly as before, with no redirect and no short link involved.
- [x] 8.7 Confirm the fallback: with the store unreachable (a second server instance pointed at an unusable `SENT_STORE_URL`), the Enviar flow still opens WhatsApp with the canonical `/c` and `/t` URLs and shows no error.
- [x] 8.8 Update `README.md` with the new route, the new page, the `links` table and the five-minute deactivation window.

> **Note on 8.7.** The browser click itself was not executed (no browser automation in this repo). The client's real `resolveShortLinks` / `buildWhatsappUrl` functions were driven directly against a server whose store was unreachable, and the composed message was asserted to carry the canonical URLs, with the roster block and the message shape unchanged.

> **Pre-existing issue found while verifying, left untouched.** `matchKeyIsReady()` in `src/lib/server/sentStore.ts` splits the match key on `:`, which breaks on a `hh:mm` time: `FGP:438:411:24/10/2026:00:00` is read as the time `00` and accepted as ready, so a not-ready match can be marked sent. The code is unchanged from git HEAD — this change did not introduce it — and it belongs to `match-send-tracking`, not to short links. Fixing it would change that capability's behaviour, so it is reported rather than silently folded in.
