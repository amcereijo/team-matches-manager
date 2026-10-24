## Why

A match link stays alive forever. The short-link store has no notion of time: a link created for Saturday's fixture still resolves on Monday, next week, next season. The link was meant to be a convenience for the players convoked to *that* match, but nothing ties its lifetime to the fixture it points at, so the club's `/links` page accumulates links for matches that have already been played, and the store keeps handing out the same stale hash for a target that is long past.

The first version of the capability listed "no expiry" as an explicit non-goal. That was the right call at the time — an expiry rule needs a date to compare against, and the store had no notion of one. It does now: the match payload carries the fixture's own date, which is already part of a match link's identity.

## What Changes

- **A match link is usable up to and including its fixture's date.** The comparison is a calendar-day comparison in `Europe/Madrid`, so a link to a match played today is still good all day — before kickoff and after it. It stops working once the day is over. A `team_calendar` link has no fixture date and never expires.
- **The resolver enforces it.** An expired match link answers with the same plain not-available page as an unknown or deactivated hash, so the rule holds whether or not anything ever cleaned the store up.
- **Creating a link cleans up the ones that should no longer be valid.** A create request first sweeps the requesting club's expired match links and deactivates them, so the club's own list and the store's "one active link per target" rule stay truthful. The sweep is scoped to the requesting club; correctness never depends on it, because the resolver is the authority.
- **An expired match link cannot be re-activated.** Re-activating it would hand back a link that cannot resolve, so the request is refused with a distinct answer.
- **A link for a date that is already past is refused at creation**, rather than being stored dead on arrival.
- **The `/links` page says "Expirado"** for a match link whose date is past, and offers no re-activation for it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `short-links`: a match link's lifetime is bounded by its fixture's date (new requirement); the resolver refuses an expired link; creating a link sweeps the club's expired match links; re-activating an expired link is refused; creating a link for a past date is refused; the `/links` page shows the expired state.

## Impact

- **Code:**
  - `src/lib/shortLink.ts` — the expiry rule as a pure function over a link's kind and payload, and the `expired` flag on the link view.
  - `src/lib/server/linkStore.ts` — the sweep (`expireStaleMatchLinks`), the expiry check in `resolveLink`, and the refusal to re-activate an expired link.
  - `src/app/api/links/route.ts` — the sweep on create, the past-date refusal, and the distinct answer for a refused re-activation.
  - `src/app/(app)/links/LinkList.tsx`, `links.module.css` — the "Expirado" state and the re-activation button's removal.
- **APIs:** `POST /api/links` gains a 400 for a past fixture date; `PATCH /api/links` gains a 409 for a refused re-activation of an expired link. The existing anonymous resolver keeps its shape.
- **Dependencies:** none.
- **Compatibility:** links already in the wild keep working until their fixture's date is over. A match link shared today starts failing tomorrow — that is the point of the change. The canonical `/c/...` and `/t/...` URLs are untouched and remain reachable on their own.
