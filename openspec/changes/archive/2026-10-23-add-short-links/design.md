## Context

See `proposal.md` — Why, for the motivation. What follows is only the current state that constrains the approach.

The app shares two public URLs per convocatoria, and both put their payload in the address:

```
/c/24%2F10%2F2026-17%3A00/Game%20with%20RIVAL/Pabell%C3%B3n%20X%20(https%3A%2F%2Fgoo.gl%2Fabc)
└──────── the data IS the address ────────┘        ~120 chars + origin ≈ 155

/t/FGP/438/HL%20NOROESTE%20A
└──── the identity IS the address ────┘              ~28 chars + origin ≈ 63
```

`/c` is long because it inlines the kickoff, the title and the venue *with its map URL*. `/t` is shorter but it spells out the competition, the club code and the squad name — and, more importantly, **neither URL can be revoked once it is in a WhatsApp group.**

Constraints carried in from the existing code:

- **Both public routes are already specified to be quiet.** `public-team-calendar` and `match-send-tracking` each state that the route MUST NOT log or capture the requester's IP or user agent, and MUST be read-only. A third-party redirect hop would break that contract from the outside.
- **The app already owns a per-club store.** `sentStore.ts` talks to a remote libSQL/Turso database via `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN`, scopes every row by `(club_code, competition)`, creates its table lazily with `CREATE TABLE IF NOT EXISTS`, and falls back to a local `file:./data/sent.sqlite`. The shape a `links` table needs is already proven.
- **The club is always taken from the iron-session, never from a request body** — the rule `match-send-tracking` states explicitly for the sent store.
- **`MatchesBoard.tsx` is `'use client'` and already holds `clubName`, `competition`, `clubCode` and the scraped `Game` rows**, so it can compute both canonical links today with no new plumbing.
- **`buildCalendarUrl()` / `buildTeamCalendarUrl()` already produce the canonical paths** and encode every segment with `encodeURIComponent`. They are the single source of truth for what a link points at, and there is no second builder to keep in sync.
- **The Enviar click currently cannot fail.** It opens a `wa.me` deep link with the whole message already in the query string. Anything added to that path must not be able to break it.

## Goals / Non-Goals

**Goals:**

- A short, opaque, app-owned URL per shared target, shorter than both canonical URLs and free of `&`, `?` and raw spaces.
- Links that can be **listed, copied, deactivated and re-activated** by the club that owns them.
- Zero third-party involvement: no redirect service, no API key, no per-link fee, no vendor outage in the path of a player's tap.
- Reuse — not reimplementation — of the existing canonical builders, the existing store, the existing session model and the existing `/links`-style UI patterns.
- The canonical `/c` and `/t` routes stay exactly as they are: they remain the source of truth, the fallback, and the answer for every link already in the wild.

**Non-Goals:**

- No click counting, no analytics, no referrer tracking. (See D9.)
- No vanity slugs, no custom aliases, no QR codes, no expiry, no signed tokens.
- No change to the `/c` or `/t` routes, their URLs, their markup or their specs.
- No attempt to make the canonical paths shorter — short links are an addition, not a replacement.
- No second database, no second set of credentials, no new env var.

## Decisions

### D1 — The shortener lives in the app: `/link/<hash>` resolves internally

The choice is between a hosted shortener (short.io) and an app-owned resolver. The app-owned resolver wins on four independent grounds, any one of which would be enough:

1. **Privacy.** A hosted shortener sees every recipient's IP and user agent at the redirect hop. The app's public pages are specified never to capture those — that is a deliberate property of this codebase, not an accident. Putting short.io in front would reintroduce the capture from outside, for a link whose content is a public fixture list.
2. **Revocation.** The `links` row *is* the kill switch. A link leaked to a group can be deactivated in one click; with short.io the app could not even see the link, let alone kill it.
3. **Cost and dependency.** short.io is a paid product above its free tier, needs an API key in the environment, and puts a network call plus a third party's uptime between the club and the message it is sending.
4. **One source of truth.** With short.io the mapping lives in two places (the app and the vendor's dashboard) and can drift; with the internal resolver the app owns the whole mapping and can list it in its own UI.

| Alternative | Why not |
|---|---|
| **short.io (hosted shortener)** | Third-party capture of every player's IP/UA; paid plan; extra hop and API failure mode; links not listable or revocable inside the app; two sources of truth. |
| **Self-hosted shortener (e.g. a small redirect service)** | Same privacy problem as short.io — the request still leaves our origin — plus an extra service to deploy and monitor. The app is already a server; it can answer the redirect itself. |
| **Shorten the canonical paths by hand** (`/t/438/a`) | Short, but it *is* the canonical route: it cannot be revoked, and it collides with the identity-only contract `/t` is specified under. |
| **Signed stateless token** (`/link/<b64payload>.<hmac>`) | No DB read, but the payload has to be carried in the URL — which is exactly what makes the current URLs long — and an HMAC secret cannot live in a browser bundle, so minting gains a round trip and a failure mode. |
| **Deterministic hash of the target** (`sha256(competition+code+squad)`) | Short and stable, but **guessable**: the target tuple is drawn from a small public catalogue, so anyone who knows the club list could enumerate every squad's link. A random token has no such structure. See D2. |

### D2 — The hash is 8 random Crockford-base32 characters

`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no `I`, `L`, `O` or `U`, so a character can never be misread off a phone screen or retyped in the wrong case. 8 characters × 5 bits = **40 bits** of entropy, drawn from `crypto.getRandomValues` (Node's `crypto`, or `globalThis.crypto` in the edge runtime).

Why random rather than derived: the link is a **capability**. Anyone who can read it can see that squad's fixtures, and the link travels in a WhatsApp group that may include people the club did not intend to reach. A deterministic hash of `(competition, club code, squad)` is enumerable by anyone holding the public club catalogue — the hash hides nothing, it just looks hidden. A random token also gives idempotency for free: the app looks the target up, and reuses the row it finds.

Why 8 characters: the whole point is that the URL is shorter than today's. `/link/7F3K9A2B` is 15 characters of path against `/t/FGP/438/HL%20NOROESTE%20A`'s 28 and `/c/…`'s ~120. 40 bits is far more than the birthday bound needs for the few hundred links a club will ever have, and a `PRIMARY KEY` collision is still handled by a retry.

Lookup is case-insensitive (the hash is stored uppercase and compared uppercase): a player who retypes a link in lower case still reaches the page.

### D3 — One `links` table in the database that already exists

The links live in the **same** libSQL database as the sent-match store, reached through the **same** `SENT_STORE_URL` / `SENT_STORE_AUTH_TOKEN` variables (with the legacy `SENT_STORE_TURSO_*` names still honoured). A second store would mean a second Vercel integration, a second credential to rotate and a second thing to back up, for the sake of a table that is a few hundred rows.

```sql
CREATE TABLE IF NOT EXISTS link (
  hash          TEXT PRIMARY KEY,      -- 8 chars, Crockford base32, uppercase
  club_code     INTEGER NOT NULL,      -- from the session, never from the body
  competition   TEXT    NOT NULL,      -- from the session
  kind          TEXT    NOT NULL,      -- 'team_calendar' | 'match_calendar'
  target_key    TEXT    NOT NULL,      -- identity of the target (D5)
  payload       TEXT    NOT NULL,      -- JSON, kind-specific parameters
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  disabled_at   TEXT,                  -- NULL while active
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_link_active_target
  ON link (club_code, competition, kind, target_key)
  WHERE disabled_at IS NULL;
```

> **Revised during apply.** The table-level `UNIQUE (club_code, competition,
> kind, target_key)` this decision originally specified cannot express the
> rules the spec sets. Three of them have to hold at once: a target has at
> most one **active** link; a deactivated link is never handed out again, so
> re-creating the target mints a **new** hash; and the deactivated row
> survives, so the club can still see what it shared and re-activate it. A
> table-level UNIQUE forbids the second and third the moment the first link
> for a target is deactivated. The constraint is therefore a **partial**
> unique index over the active rows only — "at most one ACTIVE link per
> target" — and the implementation copies the rows across when it finds a
> table left over from the earlier shape.

Why `payload` is JSON rather than columns: the two kinds carry different parameters (a squad name vs a kickoff, a title and a venue), and a JSON column keeps one table, one migration and one resolver. The kind-specific fields are few and are always read as a unit, which is exactly the shape a document column wants.

Why `target_key` is a column and not just something derived from `payload`: it is the **idempotency key**, and it must be comparable in a `UNIQUE` constraint. Deriving it from the payload would work too, but storing it makes the constraint obvious and lets the uniqueness rule survive a future change to the payload's shape.

### D4 — One shared libSQL client module

`sentStore.ts` currently owns the client, the env-var fallback chain and the schema bootstrap. The links store needs the same three things. The bootstrap moves into a small `src/lib/server/db.ts` that owns the client and the `CREATE TABLE IF NOT EXISTS` statements; `sentStore` and the new `linkStore` both use it.

This is a behaviour-preserving refactor: the sent store's table, its queries and its env-var resolution stay exactly as they are, and `match-send-tracking` is unaffected. The alternative — a second module with its own client and its own copy of the fallback chain — buys nothing and leaves two places to change when the store's configuration changes.

### D5 — The idempotency key identifies the target but deliberately excludes the kickoff time

```
team_calendar   →  <competition>:<club_code>:<squad>
match_calendar  →  <competition>:<club_code>:<date>:<local>:<visit>
```

The kickoff time is **not** part of a match's identity. The federation publishes a time, then corrects it; a link that changed its hash for that would leave the copy already pasted in the WhatsApp group pointing at the old time. With the time excluded, re-creating the link refreshes the stored parameters and the URL already in the group stays correct.

The date *is* part of the identity, because a reschedule to a different day is a different fixture, and the stored kickoff and venue belong to the original day. A club cannot play two different fixtures against the same opponent on the same day, so date + both team names is unambiguous.

Alternative considered: identity = the app's existing `matchKey` (which includes the time). Rejected for the reason above. Alternative considered: identity = the two team names only. Rejected — the second leg of a double round-robin would overwrite the first leg's link.

### D6 — The resolver redirects to the canonical path; it never renders

```
GET /link/7F3K9A2B
        │
        ├─ hash not in the alphabet ─────────────▶ 404 (plain page)
        ├─ no row, or row.disabled_at is set ────▶ 404 (plain page)
        └─ row found
              │
              └─▶ 302 Location: /t/FGP/438/HL%20NOROESTE%20A
                    │
                    └─▶ the canonical page renders, with its own cache rules
```

The resolver **derives** the canonical path from the stored payload using the same `buildTeamCalendarUrl()` / `buildCalendarUrl()` builders the app already uses, so a short link and the canonical URL always describe the same page, and there is no second definition of either path in the codebase. The client cannot supply a path or a URL — it supplies the fixture's fields, and the app derives the rest (the opponent for the title, the squad for the team link).

Redirect rather than render-in-place: the canonical pages own their markup, their caching and their failure branches, and they are field-tested. Rendering in `/link` would mean either duplicating two renderers or refactoring two working pages — for a route whose only job is to name another route. The cost is one extra round trip, and the canonical page behind it is CDN-cached for hours, so the second hop is nearly free.

`302` rather than `308`: the target of a link can legitimately change (D5's refresh), and a permanent redirect would be cached by clients far longer than the app can honour.

`Cache-Control: public, max-age=300` on the redirect: the group of players tapping the same link must not produce one store read each, and a five-minute window bounds how long a deactivated link can still be served from a cache.

Re-activating a link hands the target back to it: the other links for the same target are stood down first. A target has at most one active link, so re-activating an old link is a choice the club made by clicking on it — and the rule stays true either way. The row the club stands down is kept (deactivated, with its history) rather than deleted.

The 404 page follows the same contract as the other public pages: plain Spanish, no navigation chrome, `noindex`, no `<script>`, no subresource request, and no internal detail.

### D7 — The management API is session-scoped; the resolver is the only public route

`GET /api/links` (list), `POST /api/links` (create one or several), `PATCH /api/links` (deactivate / re-activate) — all require the iron-session club and all take the club from `session.club`, never from the body. This is the same rule `match-send-tracking` states for the sent store, and the same reason: a club must not be able to read, create or kill another club's links.

`POST /api/links` accepts a batch so that the Enviar flow needs **one** round trip for both kinds instead of two. It answers with, per requested link, its hash, its path (`/link/<hash>`) and its absolute URL.

The absolute URL is built from `NEXT_PUBLIC_WEB_APP_URL` in production and `window.location.origin` in development — the same rule the existing calendar links already follow, so no new origin-resolution logic is introduced.

### D8 — The Enviar click gains one bounded network call, and cannot fail because of it

The click currently builds the whole message in the browser and opens `wa.me`. The new sequence:

```
click "Enviar"
   │
   ├─ build the canonical /c and /t URLs           (sync, unchanged)
   ├─ POST /api/links  { match_calendar, team_calendar }   ← one call, ~2.5 s cap
   │      ├─ answered  → swap in the two short URLs
   │      └─ failed/timeout → keep the canonical URLs
   ├─ open wa.me with the message
   └─ POST /api/matches/sent  (unchanged, still optimistic)
```

The cap matters more than the call: a share that waits on an unreachable store is worse than a share with a long URL. On any failure — timeout, 5xx, malformed answer — the canonical URLs are used and the conversation opens exactly as it does today. The club sees no error, because there is nothing for them to act on: the message is complete either way.

The two calls to `/api/matches/sent` and `/api/links` are deliberately not merged: they have different lifecycles (one records a fact about the past, the other mints a capability for the future) and different failure semantics (the sent mark is optimistic and lossy, the link is best-effort with a fallback).

### D9 — No click counting

A counter on the resolver would make a read-only public route into a write on a hot path, and would sit awkwardly next to the "public routes capture nothing about the requester" contract that both existing public pages are built on. Aggregate counting is technically non-identifying, so it is not forbidden by the specs — but it is a product decision, not an implementation detail, and it is not taken here. The resolver stays strictly read-only, which is also what makes it cheap to cache.

### D10 — The `/links` page is a server component over a client component

Same shape as the Calendario: a server component reads the store and passes the rows down; a client component handles the copy / deactivate / re-activate actions through the management API and re-renders from the response.

The page needs the club's squads to offer a squad picker for the manual "create a team-calendar link" action. The squad list is derived from the fixture data exactly as the Calendario's team filter derives it, so the page reuses `getMatchesForClub()` and the same alias rules rather than introducing a second notion of "the club's squads". A squad typed by hand is accepted too — the target resolution treats an unmatched squad as an empty calendar, not an error, which is the `/t` contract already in force.

A nav entry (`🔗 Links`) is added to the `NAV` array in `Shell.tsx`, next to `Calendario` and `Configuración`.

## Risks / Trade-offs

- **[The Enviar click now depends on a network call]** → The call is capped at ~2.5 s and its failure is invisible: the canonical URLs are used instead and the message is identical in shape. The flow's failure modes are unchanged from today's.
- **[The resolver now depends on the store being up]** → The redirect is CDN-cacheable for five minutes, so a store outage only affects cache misses; and every link already in a WhatsApp group keeps working through its canonical URL, which never touches the store at all.
- **[Deactivation is not instantaneous]** → Bounded by the redirect's five-minute cache window. The `/links` page states the window next to the deactivate action, so the club is not misled into thinking the link died the instant they clicked.
- **[A link's target can change under the same URL]** → Only through the payload refresh in D5 (a corrected kickoff, a corrected venue). The `/links` page shows the current target and the last update time, so a repointed link is visible rather than surprising.
- **[The `links` table grows without bound]** → One row per `(club, kind, target)`: a handful of squads and a few dozen fixtures per season, per club. Negligible, and the table is disposable — deleting it costs nothing but the short links.
- **[Refactoring the sent store's client bootstrap touches working code]** → The refactor is behaviour-preserving (D4): the table, the queries and the env resolution are unchanged, and `match-send-tracking` keeps describing the same behaviour. It is the first task, so it is reviewed on its own.
- **[Two URLs now reach the same content]** → The canonical route is untouched and remains the source of truth; `/link` only names it. A player with an old link is unaffected, and a player with a new link gets the same page by a shorter route.

## Migration Plan

The change is additive — no data to migrate, no env var to add, no existing row to touch.

1. **Deploy** the new table bootstrap, the store module, the resolver, the API and the page. `CREATE TABLE IF NOT EXISTS` creates `link` on first use, exactly as `match_send` is created today.
2. **Local development** uses the same `file:./data/sent.sqlite` file; no extra setup.
3. **Rollback** is a code revert. To stop emitting short links without a redeploy of the whole app, the message builder keeps the canonical URLs as its fallback path — turning short links off is removing the resolution step from the Enviar handler. The table can be left in place; the `/link` route can be removed without affecting any canonical URL.

## Open Questions

- Should a link be **re-pointed** by hand from the `/links` page (not just refreshed by re-creation)? Deferrable: it does not change the resolver, the API's shape or the specs.
- Should the `/links` page offer **match** links by hand, choosing from the upcoming fixtures, as it already does for team links? Deferrable: the Enviar flow covers the match case, and the page can grow a fixture picker later.
- Should the club ever be able to choose a **vanity slug** (`/link/noroeste-a`)? Deferrable: it is a different addressing scheme on top of the same table, not a different capability.
