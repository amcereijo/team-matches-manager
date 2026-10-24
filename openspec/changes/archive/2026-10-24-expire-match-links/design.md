## Context

The short-link store (`src/lib/server/linkStore.ts`) holds one row per link: a random hash, the owning club, the kind, a target key and a JSON payload. For a `match_calendar` link the payload carries the fixture's own `date` (`dd/mm/yyyy`) and `time` (`hh:mm`) — the same strings the federation publishes — because the canonical path is derived from them later.

The store has no notion of time. `resolveLink()` answers `null` for a hash it does not know and for a row with `disabled_at` set, and that is the whole of its notion of "not available". A match link therefore stays resolvable forever.

Two existing helpers already encode the calendar arithmetic the rule needs, both in `src/lib/matchDate.ts`:

- `parseSidgadDate(date, time)` turns `dd/mm/yyyy` + `hh:mm` into a `Date` whose **UTC fields hold the Europe/Madrid wall-clock components**. This is a deliberate convention, not an absolute instant: it makes "15:30 Madrid on 2026-10-18" compare like-for-like on Vercel (UTC host) and on a developer's Mac (Madrid host).
- `nowInMadrid()` returns "now" in the same encoding.

The `competition.ts` filter already drops past fixtures from the Calendario by comparing a kickoff against `nowInMadrid()`, so the app already has a Madrid-anchored notion of "now" and a precedent for comparing against it.

## Goals / Non-Goals

**Goals:**

- A match link stops resolving once its fixture's date is over, and stays usable for the whole of that day.
- The rule holds on its own, with no background job: the resolver is the authority.
- Creating a link leaves the club's own list truthful.
- No schema change, no migration, no new dependency.

**Non-Goals:**

- Expiring team-calendar links. A squad link names a team, not a fixture; there is no date to expire on.
- Revoking the canonical `/c/...` and `/t/...` URLs. The short link is the revocable name; the canonical path is the page, and it stays reachable by design (see the archived `add-short-links` design).
- A scheduled job. The app has no cron, no queue and no worker, and a create request is a good enough trigger for the hygiene sweep.
- Counting clicks or any other use of the link.

## Decisions

### D1 — The rule is a calendar-day comparison in `Europe/Madrid`, not a kickoff comparison

**Decision.** A match link is expired when the fixture's date is strictly before today's date in `Europe/Madrid`. The kickoff time plays no part.

**Why.** "Available up to the fixture's date, and the fixture's own day still counts" is a day-granular promise. Comparing the full kickoff timestamp would kill a link at 17:00 on the day of a 17:00 match, while players are still travelling to the pitch. The date is also the field the federation publishes and the one already stored in the payload, so the rule needs nothing else.

**Alternative considered.** Expire at the end of the kickoff instant (i.e. `kickoff + 3h`). More precise in principle, but it contradicts the requested day-granular behaviour and would expire a link for a late kickoff while the match is still being played.

**Consequence.** The comparison is implemented as a day key — `Date.UTC(y, m, d)` of the two dates' UTC fields — so it is a pure comparison of two numbers, immune to the hour and to any DST shift. `nowInMadrid()` already yields Madrid components in the UTC slots, so its day key is Madrid's day.

### D2 — The rule is derived from the payload; the table does not change

**Decision.** The expiry is computed from `payload.date`. No `expires_at` column is added.

**Why.** The payload already holds the fixture's date, so a column would be a second copy of a fact that can be wrong. `ensureLinkSchema()` bootstraps the table with `CREATE TABLE IF NOT EXISTS` and has one hand-rolled rebuild for a legacy constraint; adding a column would mean a third migration path, and every existing row would need a backfill to be consistent. Deriving it means the links already in the wild start expiring the moment this ships, with no migration step.

**Alternative considered.** A `valid_until` column holding the exclusive end of the fixture's day, indexed for a cheap SQL sweep. It would make the sweep a single `UPDATE` with no JSON parsing. The cost is a migration, a backfill, and a second source of truth for the same date. The number of active match links per club is in the order of a dozen, so the sweep's cost is irrelevant.

### D3 — The resolver is the authority; the sweep is hygiene

**Decision.** Two independent mechanisms:

1. `resolveLink()` returns `null` for an expired match link. This is what actually enforces the rule.
2. A create request sweeps the requesting club's expired match links and deactivates them.

**Why.** The two answer different questions. The resolver answers "may this link be opened right now?", and it must answer it correctly for every link in the table — including links for clubs that never create another link. The sweep answers "is the club's own list still true?", and it only matters for the club that triggers it.

**Alternative considered.** Only sweeping, with no resolver check. Then the rule would depend on somebody creating a link, and a link for a match that is over would keep resolving until the club's next share. Not acceptable.

**Alternative considered.** Only the resolver check, with no sweep. Correct, but the club's `/links` page would keep showing "Activo" for links that cannot open, and the store's partial unique index (`one ACTIVE link per target`) would keep expired rows holding slots.

### D4 — The sweep is scoped to the requesting club

**Decision.** `expireStaleMatchLinks(club)` deactivates only the calling club's expired match links.

**Why.** Per-club isolation is an explicit invariant of this capability ("a club MUST NOT be able to read, create, modify or disable another club's links"). A club's request writing to another club's rows would break that invariant in the one place a reviewer would look. Because the resolver enforces expiry regardless, scoping the sweep costs nothing in correctness — it only means that a club that never logs in again keeps some deactivated-pending rows, which is harmless.

**Alternative considered.** A global sweep over every club's expired links. Better hygiene for the table as a whole, but it makes one tenant's request mutate another tenant's data. Rejected on the isolation invariant.

**Consequence.** The sweep deactivates rather than deletes. The deactivated row survives, so the club still sees what it shared — and, because a deactivated link is never handed out again, creating that target afterwards mints a new hash. An expired link is therefore dead for good, exactly like one the club killed by hand.

### D5 — An expired link cannot be re-activated, and a past-dated link cannot be created

**Decision.**

- `setLinkActive(club, hash, true)` refuses a match link whose date is over. The API answers `409` with a distinct error, not the `404` it gives for an unknown link — the club owns that link, and telling it "not found" would be a lie.
- A create request for a fixture whose date is already past is refused with `400`.

**Why.** Re-activating an expired link would hand the club a link that cannot open, and would put a row back into the `ACTIVE` state that the rule says it must not be in. Refusing the creation avoids storing a link that is dead on arrival.

**Consequence.** The Enviar flow is unaffected: the Calendario already hides fixtures whose kickoff has passed, and a fixture played earlier today is still shareable (the rule is day-granular). A refused create is not an error the club ever sees — `resolveShortLinks()` falls back to the canonical URLs on any non-2xx, exactly as it does today.

**Alternative considered.** Accepting a past-dated link and letting the resolver reject it. Simpler, but it fills the store with links that can never work and gives the club a URL that 404s on the first tap.

### D6 — An unparseable date counts as expired

**Decision.** A match link whose `payload.date` cannot be parsed is treated as expired.

**Why.** "Not provably still valid" must not read as "still valid". A payload with a broken date cannot be checked against the rule, and the conservative answer keeps the store's promise: a match link opens only while its fixture is current.

### D7 — The five-minute redirect cache still applies at the day boundary

**Decision.** The resolver's cache headers stay `public, max-age=300`.

**Why.** The cache already delays a *manual* deactivation by up to five minutes, and the `/links` page says so. The expiry rule inherits that same, already-documented delay rather than introducing a second, stricter caching policy for one class of link. Tightening it would also mean the resolver emitted different cache headers depending on the link's kind, which is a small complexity for a boundary that is already fuzzy by design.

**Consequence.** A match link can keep resolving for up to five minutes past midnight in Madrid. This is stated on the `/links` page alongside the existing note.

## Risks / Trade-offs

- **The canonical URL is unaffected.** A player who was sent the short link and then opens the `/c/...` URL behind it keeps a working page forever. Only the short name expires. → Accepted: the short link is the revocable artefact, and the canonical page is the source of truth for the fixture's own contents.
- **A link dies at midnight, not at the kickoff.** A fixture played at 21:00 stays shareable until the end of that day, which is the requested behaviour but is later than "the match is over". → Accepted, stated in the `/links` page.
- **The sweep runs on the create path.** It adds one read and one write to a request that already writes. → Accepted: it is one extra query and one `UPDATE` for a club's handful of links.
- **An existing club may notice links dying.** A club that shared a match last week and re-opens the link today now gets the not-available page. → Expected, and the point of the change.
- **Timezone drift.** The rule compares Madrid days; a server whose clock is wrong, or a device in another timezone reading the `/links` page, could disagree by a day at the boundary. → Mitigated by `nowInMadrid()`, which reads the wall clock in `Europe/Madrid` rather than relying on the host's timezone, and by the day-key comparison, which ignores the hour.

## Migration Plan

None. No schema change, no backfill, no data migration. The links already in the table begin expiring by their own fixture date as soon as the new code is deployed.

**Rollback:** revert the deployment. The deactivated rows written by the sweep stay deactivated — the same as any link the club deactivated by hand — and re-activating one restores it.

## Open Questions

None.
