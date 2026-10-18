## Why

Clubs that field more than one squad (e.g. senior A, senior B, women's, youth) currently see every fixture for every squad jammed into a single Calendario list. A delegate who only manages one squad has to scroll past rows they never act on. We need a way to narrow the Calendario to the squads the user actually cares about, with the choice remembered on the device so they don't re-set it on every visit.

## What Changes

- Add a multi-select "Equipos" filter dropdown to the Calendario page. Each checkbox represents one of the user's own squads that appears as `local` or `visit` in their upcoming fixtures. Selecting "Todos" (default) shows every fixture; unchecking any squad hides every fixture that involves that squad.
- The filter is purely a UI view over the already-fetched `matches` array — no extra request, no upstream re-fetch. The server still returns the full agenda; the Calendario just renders a subset.
- The selection is persisted on the device with `localStorage` (via the existing `getItem`/`setItem` helpers in `src/services/storage.ts`, namespace `tmm.web.calendario.teamFilter`). Cross-device sync is not required and not in scope.
- The Calendario header count (`"N partidos"`) reflects the filtered visible count, not the upstream total, so users can tell at a glance how many rows match their filter.
- An empty / missing storage value is treated identically to "Todos" (no filter applied). When every available squad is checked, behaviour is identical to "Todos" too — toggling the last unchecked box returns to the unfiltered view.
- The filter is reactive: a sidebar change immediately re-renders the row list. No "Apply" button.

Filter list scope: only **the user's own squads** (teams whose name matches the club's name aliases via the existing `clubAliases` / `isClubMatch` logic in `src/services/competition.ts`). Rival clubs are not filterable — they only appear as the other side of the fixture.

## Capabilities

### New Capabilities

- `calendario-team-filter`: lets a Calendario user narrow the visible list to a subset of their own squads via a multi-select dropdown, with the choice persisted on the device. Covers the dropdown UI, the squad-derivation rule, the filter predicate over `matches`, the header-count behavior, and the localStorage persistence contract.

### Modified Capabilities

(none — no existing capability's REQUIREMENTS change.)

## Impact

- **Modified files** in `web-app/`:
  - `src/app/(app)/calendario/MatchesBoard.tsx` — derive the user's squad list from the matches, render the multi-select dropdown, persist selection to `localStorage`, filter the rendered rows and the header count
  - `src/app/(app)/calendario/calendario.module.css` — styles for the dropdown trigger, the checkbox list, the "Todos" affordance, the disabled-empty state
- **No new files** (unless we choose to split the dropdown into its own component — see design D2).
- **No new dependencies** — `localStorage` is browser-native and the project already wraps it in `src/services/storage.ts`.
- **No server-side changes** — `getMatchesForClub`, the `competition.ts` filter, the API routes, and the home page are untouched. The home page's "Próximo partido" / "Partidos en agenda" continue to reflect the unfiltered agenda.
- **No privacy / data concerns** — selection is a list of the user's own squad names stored in `localStorage`; no PII; not synced anywhere.
- **No migration** — first visit after deploy sees the default (Todos) until the user interacts.