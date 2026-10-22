## Why

The convocatoria WhatsApp message tells a player about **one** fixture and nothing else. A player who taps the link lands on a page about that one match, then has to go back to WhatsApp and wait for the next convocatoria to learn about the rest of their team's season. The single most common question after "when is the next one?" is "and the one after that?" — and right now the app cannot answer it from a link the player already has.

The current `/c/[...]` page cannot be extended to answer it. That page is a pure function of its own URL — the match data *is* the address — which is exactly why it is fast, deterministic, and cannot fail. A list of fixtures cannot be carried in a path; it has to be *pointed at*. This change **adds** a second public page, `/t/[competition]/[code]/[squad]`, that resolves a team's identity from the URL, fetches the current agenda, and renders the squad's upcoming fixtures — leaving the single-match page and its link exactly as they are.

## What Changes

- The convocatoria gains a **second** link, `📅 Calendario del equipo:`, alongside the existing `📅 Añadir al calendario:` line. The existing line, the `/c` page it points at, and every link already sent are **unchanged**. The two links answer different questions: one adds *this* fixture to your calendar, the other shows *the squad's whole upcoming season*.
- The team link is scoped to the **squad the convocatoria was sent for** — the side of the fixture belonging to the club — not the whole club. A player in `NOROESTE A` sees `NOROESTE A`'s fixtures.
- Which side belongs to the club MUST be decided from the upstream `param_game` codes as well as the name aliases. The federation's squad names do not derive from the catalogue's club names (`ALAMEDA DE OSUNA A` is club 386's `ALAMEDA OSUNA HP`), so a name-only test produces a link scoped to the rival.
- The new `/t` URL is short (~70 chars) because the address carries an identity rather than a payload, and it contains no `&` or `?`.
- **No link expiry.** The page always reflects the current upstream agenda, refreshed from a multi-hour cache rather than pinned at send time. Its freshness is disclosed on the page.
- **No per-match pinning.** The page features the nearest upcoming fixture; the convoked match is almost always the nearest one, and not encoding it keeps the URL short and the route's failure surface small.
- Every fixture **more than 15 days away** renders a notice that its date is provisional and may change until 15 days before the match weekend. This is independent of whether the kickoff time has been published — a far-off fixture with a confirmed time is still reschedulable. Fixtures inside the 15-day window carry no notice, because the federation can no longer move them.
- Separately and orthogonally, a fixture with no published kickoff time shows "hora por confirmar" and offers no add-to-calendar action. A far-off fixture can show both.
- The page's add-to-calendar action is labelled **"Añadir a calendario"**.
- The new public route performs network I/O (the sidgad scrape) and therefore has a cache, a latency profile, and an error branch that `/c` does not.
- `decodeFully` / `escapeHtml` / `splitVenue` lift out of the `/c` route into a shared module so both routes use one implementation. `decodeFully` in particular is not optional: a link relayed through WhatsApp arrives with an extra percent-encoding layer, and this is what previously made `/c` 400 on a perfectly good link.
- Deciding "which side is ours" is centralised in one `isOurSide` helper rather than re-derived per call site; the existing `Enviar` gating (confirmed date and time only) is unchanged.

## Capabilities

### New Capabilities

- `public-team-calendar`: the public, session-less `/t/[competition]/[code]/[squad]` page — URL shape and identity validation, squad scoping, the response matrix (200 / 200-empty / 404 / 502), cache headers and the freshness disclosure, and the privacy posture (no session, no script, `noindex`, no requester logging).

### Modified Capabilities

- `match-send-tracking`: the "Convocatoria includes a one-tap 'Add to calendar' link for ready matches" requirement changes — it gains a second, squad-scoped team-calendar link alongside the existing one, and records the retention of `/c` as the message's primary calendar link.

## Impact

- **Code:**
  - `src/app/(app)/calendario/MatchesBoard.tsx` — add the `📅 Calendario del equipo:` line after the existing `📅 Añadir al calendario:` line. The club's `competition` and `code` are already props, so no new plumbing.
  - `src/lib/calendarEvent.ts` — add `squadFor(game, club)`, `buildTeamCalendarUrl(...)`, and a shared `isOurSide(team, teamCode, club)` helper. `squadFor` and `opponentFor` change signature to take the club (code + name) instead of just its name.
  - `src/lib/html.ts` — **new**; `escapeHtml` and `splitVenue` moved out of the `/c` route handler, reused by both routes.
  - `src/app/t/[competition]/[code]/[squad]/route.ts` — **new** public GET handler.
  - `src/app/c/[...path]/route.ts` — markup and behaviour unchanged; becomes a consumer of the shared helpers.
- **APIs:** one new public route, `GET /t/[competition]/[code]/[squad]`. No auth, no session read, no writes, no database.
- **Dependencies:** none. Reuses `axios` + `cheerio` already in use, plus `Intl` for date formatting.
- **Performance:** one sidgad scrape can now be triggered by a public tap. Mitigated by a browser/CDN cache measured in hours and a federation-scoped in-process cache so one scrape serves every club in that competition. Side benefit: the same cache layer could later serve the admin Calendario, which currently re-scrapes on every load.
- **Message length:** the message now carries two URLs (~270 chars total). Accepted deliberately — the `/c` one-tap action and the `/t` standing reference serve different intents, and `/c` is the only page that works when the federation is unreachable.
- **Freshness tradeoff (accepted):** with hours-long caching, a postponement or a newly-published kickoff time may be invisible for up to the cache window. The message text itself always carries the authoritative time, and the page discloses its own generation time, so the reader can judge it.
- **Resilience:** the 502 branch cannot link back to `/c` for the convoked match, because the `/t` URL deliberately does not identify a match. Accepted: with `stale-while-revalidate` a 502 rarely reaches a player, and the message's own `/c` link is the working fallback.
- **Privacy:** the route is public by necessity (recipients are not club admins). It reads no session, sets no cookie, and MUST NOT log the requester's IP or user agent — the same posture `/c` holds today. Fixture data is already public on the federation's own site, so nothing here is newly exposed.