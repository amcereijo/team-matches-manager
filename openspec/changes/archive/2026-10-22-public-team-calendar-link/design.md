## Context

See `proposal.md` — Why, for the motivation. What follows is only the current state that constrains the approach.

The app has exactly one public route today, `/c/[...path]`, and it works because of a property worth naming precisely: **it is a pure function of its own URL.**

```
/c/18%2F10%2F2026-18%3A30/Game%20with%20RIVAL/Pabell%C3%B3n%20X%20(...)
└────────────── the data IS the address ──────────────┘
                          │
             parseEventPath() → render HTML
      zero I/O · zero auth · deterministic · cannot fail
```

A fixture *list* cannot be carried in a path — the encode-the-payload approach dies at around one fixture. So `/t` flips the relationship: the address carries an **identity**, and the page **points at** data.

```
      /c  (stateless)                    /t  (live)
 ┌──────────────────────┐        ┌──────────────────────────┐
 │ parse path           │        │ parse path               │
 │   ↓                  │        │   ↓                      │
 │ render ──────────────┼──▶HTML │ resolve club from CLUBS  │
 │                      │        │   ↓                      │
 │ 0 ms · cannot fail   │        │ scrape sidgad + filter   │
 │                      │        │   ↓                      │
 │ no cache needed      │        │ render ───────────────┼──▶HTML
 └──────────────────────┘        │ 500ms–3s · CAN fail      │
                                 │ cache in HOURS · CAN be  │
                                 │   stale                   │
                                 └──────────────────────────┘
```

That flip is the whole design problem. Caching, latency, staleness disclosure, and an error branch all become first-class concerns for the first time in this codebase.

**Constraints carried in from existing code:**

- `src/lib/calendarEvent.ts` already solves the hardest part of this problem — surviving a link that has been relayed through WhatsApp — via `decodeFully()`. Its comment records that decoding once and assuming a clean result "is what made this page start 400ing with a perfectly good link". The squad segment arrives over exactly the same wire and will take exactly the same damage.
- `getMatchesForClub()` already produces precisely the desired set: filtered to the club, past fixtures dropped, pending fixtures (no confirmed time) retained.
- The club catalogue (`CLUBS`) holds one row per `(competition, code)` and **no club name ends in `" A"`…`" E"`**. Squad names exist only on fixture rows. So club identity is catalogue data and squad identity is derived string data — an asymmetry that drives the validation model.
- `MatchesBoard.tsx` is `'use client'` and receives `clubName`, `competition`, `clubCode` already. No new plumbing is needed to build the URL.

## Goals / Non-Goals

**Goals:**

- A single short, stable, non-expiring link per squad that resolves to that squad's current upcoming fixtures.
- Reuse — not reimplementation — of the path-decoding, HTML-escaping, venue-splitting, and Spanish date formatting that `/c` already proves in production.
- Preserve `/c`'s zero-dependency guarantee for links already in the wild and as the outage path.
- Make staleness visible rather than silent.

**Non-Goals:**

- No expiry, no signed tokens, no server-side link minting.
- No results/past fixtures.
- No search indexing, no JSON API, no print/subscribe/ICS export.
- No per-match pinning or highlighting of the convoked fixture.
- No refactor of the admin Calendario's own uncached scrape (noted as a future win, deliberately out of scope).
- No change to `/c`'s markup — it ships and is field-tested; touching it buys nothing.

## Decisions

### D1 — The URL carries an unsigned identity: `/t/[competition]/[code]/[squad]`

```
https://team-matches-manager.vercel.app/t/FGP/438/HL%20NOROESTE%20A
                                        ─┬─ ─┬── ─┬── ───────────────
                                        │    │   │   └─ squad: derived from THIS fixture
                                        │    │   └───── club code: catalogue-validated
                                        │    └────────── competition: catalogue-validated
                                        └──────────────── new public route
```

Chosen over the alternatives:

| Alternative | Why not |
|---|---|
| **Signed capability token** (`/t/<b64>.<hmac>`) | Requires minting server-side — an HMAC secret cannot live in a browser bundle, so the "Enviar" click gains a network round-trip and a *new failure mode* in the one flow that currently cannot fail. Its real value is expiry, which the user explicitly does not want. |
| **Opaque/base64 identity without a signature** | Obfuscation with no security property — an attacker decodes it in one line. Strictly worse than a readable URL. |
| **Club slug** (`/t/fgp/impulso-urbano-hl`) | Prettier, but squad suffixes, accents and dots (`C. COMPAÑIA DE MAR`, `NOROESTE A`) make slugify/rehydrate lossy, and the page would still need the real name to filter. |
| **Squad slug** instead of encoded name | Same fidelity problem, plus it would need the same `decodeFully` defence anyway. The encoded name is self-describing and needs no inverse transform. |

Rejected the whole family on one ground: **the data is already public.** The underlying `sidgad.cloud/.../agenda_portales.php` endpoint takes public params and returns every club's fixtures to anyone who asks. Non-enumerability would protect nothing that isn't already exposed at the source.

Keeping the club code is still right even though the squad name is nearly sufficient on its own: the code resolves against `CLUBS`, which gives the page a validated display name for the header and a clean 404 for unknown clubs.

### D2 — Squad is a name filter, not a lookup — so failure semantics differ by branch

Because squad names live on fixtures and nowhere else (no catalogue of them exists, and the set drifts as the season moves), the route validates *identity* but cannot validate *scope*:

```
  /t/FGP/999/ANYTHING  →  999 not in CLUBS        →  404
  /t/XXX/438/NOROESTE A →  XXX not in COMPETITIONS →  404
  /t/FGP/438/PWNED     →  resolves fine, matches nothing →  200 + empty state
  /t/FGP/438/NOROESTE A →  resolves fine, matches 4   →  200 + list
```

A hand-crafted or stale squad name yields an **empty 200, never a 404**. This is not a nicety — it is the common case: a player opening a three-week-old message finds the squad's fixtures have all moved into the past. A 404 reads as a broken link; an empty state reads as "nothing scheduled". Only identity is 404-able, because only identity is something we can be *wrong* about.

### D3 — The team link is ADDED to the message, not substituted for the calendar link

> **Revised during apply.** This decision originally chose "replace", and the
> reason it was reversed is worth keeping: the replace-vs-add argument was made
> on message-length grounds (~270 chars of URL) before anyone looked at the
> rendered message on a real club's real fixtures. Seeing the two options side
> by side, the user asked for the add-to-calendar link back. The length argument
> was real but it was weighed against the wrong baseline — `/c` was never a
> luxury, it is the only page in the app that works when the federation is down,
> and its one-tap button is the action a player actually wants on the fixture
> they were just convoked for.

```
 BOTH LINKS (chosen)

 📅 Añadir al calendario:
 https://…/c/23%2F10%2F2026-18%3A30/Game%20with%20RIVAL/Pabell%C3%B3n%20X%20(…)

 📅 Calendario del equipo:
 https://…/t/FGP/438/HL%20NOROESTE%20A

 Porteros:
 1.
```

A blank line separates the two link blocks so they read as distinct actions
rather than one run-on paragraph. `buildCalendarUrl` is therefore **not**
removed — it is restored, and `MatchesBoard` emits both.

The two links answer different questions and neither subsumes the other:

| | `/c` add-to-calendar | `/t` team calendar |
|---|---|---|
| Answers | "put *this* match in my calendar" | "when is my next match?" |
| Data | encoded in the URL, zero I/O | fetched live from the federation |
| Fails when | never | federation unreachable / stale |
| Scope | one fixture | the squad's whole upcoming season |

Decoupling from readiness still holds for the team link: the squad name is
readable off any fixture, so `/t` needs no date or time to be built. The
Calendario's `Enviar` control remains gated on a confirmed date and time
(`{!ready ? null : …}`), which the user confirmed is correct — so a pending
match still cannot be convoked, and the "hora por confirmar" treatment is
reached by opening the team link from a *different*, ready match.

### D4 — No per-match pinning

The page features the nearest upcoming fixture; nothing identifies the convocated match.

Pinning was available for ~one extra path segment (`…/NOROESTE%20A/2026-10-18-1830`) and was declined because the convocated match is almost always the nearest one, so the feature would rarely fire — while every extra segment is more surface for the WhatsApp relay damage that already broke `/c` once.

There is a real cost, recorded rather than hidden: **the 502 branch cannot link back to `/c` for the convocated match**, because the URL no longer identifies a match. Accepted — with `stale-while-revalidate` a 502 rarely reaches a player at all (see D5), and the honest "no se pudo cargar" page beats a dead end dressed up as a rescue.

### D5 — Freshness measured in hours, disclosed on the page

```
Cache-Control: public,
  max-age=3600,               /* this phone, re-tapping: no round trip at all */
  s-maxage=7200,              /* Vercel edge: every other player: no lambda cold start */
  stale-while-revalidate=21600
```

`max-age` and `s-maxage` pull in opposite directions and **both** help here. `max-age` is a win most people miss: a player re-tapping a link they received this morning renders from their own browser cache, not the network. `s-maxage` means 14 other players tapping the same link hit the edge rather than the federation.

With a window this long, "when is this data from?" becomes a genuine question, so the page renders its generation time:

```
  ⚽  HL NOROESTE A              Galicia
  Próximos partidos · 4
  Datos actualizados a las 10:04        ← generated at render; ages visibly as served
```

The page is generated once and served by the CDN for hours, so the timestamp costs one `<p>` and removes the entire class of "why doesn't this match the message I just got" confusion.

A module-scope cache of the **unfiltered** federation scrape backs this up — `fetchFgpMatches()` returns every match and only the per-club filter differs, so one scrape serves every club in that competition:

```
  ┌─────────────────────┐
  │ FGP agenda (all)    │──┬──▶ /t/FGP/438/A → 4 rows
  │ module scope, hours │──┼──▶ /t/FGP/438/B → 2 rows
  └─────────────────────┘──┴──▶ /t/FGP/145   → 9 rows
```

On Vercel serverless this cache will often cold-start with the lambda and is therefore a bonus, not the primary lever — the CDN header is the lever that actually holds.

### D8 — "Which side is ours" must consult codes, not just names

The federation's squad names do not derive from the catalogue's club names.
Club 386 is `ALAMEDA OSUNA HP` in `CLUBS`, and its squads appear on fixtures
as `ALAMEDA DE OSUNA A`, `ALAMEDA DE OSUNA B`, `ALAMEDA DE OSUNA C`. Not one
of those aliases-matches the catalogue name.

`getMatchesForClub` already handles this by checking the `param_game` codes
*as well as* the name aliases. Every new helper that answers "which side of
this fixture belongs to me" MUST do the same, and MUST NOT re-derive the rule
from name aliases alone. Two bugs during implementation came from exactly that:

- `selectSquadFixtures` filtered on names only, so `/t/FMP/386/ALAMEDA DE OSUNA A`
  returned an empty calendar for the very clubs whose names had diverged most.
- `squadFor` fell through to `game.visit` when neither side aliased-matched,
  producing `/t/FMP/386/CDE%20EL%20CASAR%20A` — a link scoped to **the rival**.
  The same flaw in a private `opponentFor` copy on the `/t` page produced
  calendar titles like `Game with ALAMEDA DE OSUNA A` — the user's own team.

Both are now routed through one shared `isOurSide(team, teamCode, club)` helper
in `lib/calendarEvent.ts`, which is the single place that answers the question.

The inverse rule needs the opposite treatment. Squad *scoping* must be an
**exact** normalised name comparison, not `isClubMatch`: `clubAliases` strips a
trailing ` A`/` B` to build a stem, and `isClubMatch`'s `startsWith` then pulls
in every sibling squad. Before that fix squad A's calendar showed 146 rows
including all of squad B's; exact matching yields 51 and 32 respectively.

So the two rules are deliberately asymmetric, and confusing them fails in both
directions:

```
  club membership   →  code OR name-alias   (lenient — names diverge from codes)
  squad scoping     →  exact normalised name (strict — the stem must not match siblings)
```

### D6 — Shared helpers, frozen `/c` markup

`decodeFully`, `escapeHtml`, and `splitVenue` move out of `src/app/c/[...path]/route.ts` into a shared `src/lib/` module; both routes import them.

`decodeFully` is the one that must not be reimplemented from memory — it exists because a WhatsApp-relayed link arrives with an extra encoding layer, and getting it wrong reproduces a bug that was already found and fixed once. `/c`'s markup and behaviour stay exactly as shipped; only its helper imports change.

### D7 — `route.ts`, not `page.tsx`

The page must carry no app chrome, no session read, and no `<script>` (so the reader cannot filter client-side without giving that up). Next.js forbids a `page.tsx` and `route.ts` at the same path, so `route.ts` returning hand-built HTML — the same choice `/c` made, reusing the same CSS-variable block so the two read as one product — is the consistent answer.

## Follow-ups (out of scope for this change)

- **The admin Calendario still re-scrapes uncached** on every page load. The federation cache built here (`fetchCompetitionMatches`) could serve it for free; it was left out so this change's rollback boundary stays clean.
- **`buildGoogleCalendarUrl` is re-derived per row** on the `/t` page. Fine at the 30–60 fixtures a squad currently shows; worth revisiting if that ever grows past a few hundred.

## Risks / Trade-offs

- **A postponement or newly-published kickoff time is invisible for up to the cache window** → Accepted deliberately (the user chose hours over minutes). The convocatoria message text always carries the authoritative time, so the channel the player actually acts on is never stale; the page is an overview. The visible "updated at" timestamp lets a reader judge it. `stale-while-revalidate` means users are served *something* during revalidation, never a spinner and then an error.
- **A public route can now trigger a federation scrape** → Mitigated by browser + CDN caching in hours, plus the module-scope federation cache. One scrape serves all clubs in a competition, and the edge absorbs repeats.
- **`decodeFully` mishandled for the squad segment** → `/c` 400s on a good link; a player sees "no se pudo cargar" and has no recourse → Mitigated by sharing the existing implementation verbatim rather than writing a new one (D6), and by post-render whitespace normalisation, since a mangled relay can turn `%20` into `+` or drop a space entirely.
- **Club names or squad names containing characters that confuse the parser** → Mitigated by `encodeURIComponent` per segment plus `decodeFully` + whitespace normalisation on the way back.
- **The obvious future "cleanup" is to delete `/c` now that it's unreferenced by the message** → It is *not* unreferenced: every link already sent depends on it, and it is the only route that cannot fail. Deliberately retained and documented as such.
- **Scope creep toward caching the admin Calendario too** → Explicitly a non-goal. It is a real win and belongs in its own change; folding it in here would blur this change's rollback boundary.