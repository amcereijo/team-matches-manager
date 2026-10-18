## Context

The Calendario (`web-app/src/app/(app)/calendario/`) is a server-rendered Next.js 14 App Router page. Its server component (`page.tsx`) calls `getMatchesForClub(club)` and passes the resulting `matches` to a client component (`MatchesBoard.tsx`). The client component already wraps `localStorage` via `src/services/storage.ts` (`getItem`/`setItem` with the `tmm.web.` namespace) — the same helpers used to remember the `ShareInfoPanel` dismissal.

The agenda returned by the server is already filtered to the user's club (via `clubAliases` + `isClubMatch` in `src/services/competition.ts`). Today `MatchesBoard` renders the list one-row-per-match with no per-team narrowing.

See `proposal.md` for motivation; see `specs/calendario-team-filter/spec.md` for the behavioural contract this design implements.

## Goals / Non-Goals

**Goals:**
- Add a reactive multi-select dropdown to the Calendario that filters the rendered rows to a user-chosen subset of their own squads.
- Persist the selection on the device; fall back to "Todos" when missing or stale.
- Keep the change scoped to the Calendario surface — no server changes, no new dependencies, no new shared abstractions beyond what's already in `src/services/storage.ts`.

**Non-Goals:**
- Filtering by opponent (rival) clubs — explicitly out per the user's clarification.
- Cross-device sync of the selection (no server, no account).
- Search / fuzzy match across team names — checkbox list is enough for the small squad counts (typically <10).
- A "Select all / Clear" buttons row beyond the "Todos" checkbox — out of scope; the "Todos" checkbox is the single bulk action.
- Touching `MatchesBoard`'s existing sent-tracking, share-info, or week-separator logic.

## Decisions

### D1 — Squad list is derived inside `MatchesBoard` from the matches prop, not fetched separately

**Choice:** Derive the squad list inside `MatchesBoard` by filtering `matches` with the same alias rule the server uses (`clubAliases`/`isClubMatch` in `src/services/competition.ts`).

**Why:** The matches prop is already filtered to the user's club on the server. The set of distinct `local`/`visit` names that pass the alias rule is exactly the set of the user's own squads. Re-using the server rule keeps "what counts as my team" identical in both places — no risk of the filter showing a name that isn't in the agenda.

**Alternatives considered:**
- *Pass an explicit `teams: string[]` prop from the server page:* rejected — `MatchesResponse.teams` already exists but is the full federation-wide team list (every club's name), not the user's own squads. Using it would either confuse the filter with rivals or require the server to filter it down too, adding a second rule to keep in sync.
- *Add a new server route:* rejected — the data is already in the matches prop; an extra fetch is unnecessary.

To keep the alias logic in one place, we move (or duplicate-read) `clubAliases`/`isClubMatch` into a shared helper under `src/lib/clubTeams.ts` and import it from both `services/competition.ts` and `MatchesBoard.tsx`. Duplication is the smaller evil than a circular import between a server module and a client component.

### D2 — Inline component for the dropdown; no new file unless it grows

**Choice:** Keep the dropdown JSX inside `MatchesBoard.tsx` initially. If the component file exceeds a sensible size after this change, split the dropdown into `src/app/(app)/calendario/TeamFilter.tsx`.

**Why:** The dropdown is tightly coupled to `MatchesBoard`'s state (selection, squad list, `setItem`/`getItem` writes). Splitting it now would either require prop-drilling 4-5 values or hoisting state into a context — both are premature for a single-use widget.

**Trigger to split:** if `MatchesBoard.tsx` grows past ~600 lines or the dropdown exceeds ~80 lines of JSX.

### D3 — Storage model: JSON array of selected squad names

**Choice:** Persist the selection as a JSON-encoded `string[]` under the key `calendario.teamFilter` (which becomes `tmm.web.calendario.teamFilter` after the namespace prefix in `services/storage.ts`).

**Why:** Squad names are arbitrary strings and may contain commas, quotes, or accented characters. JSON encoding sidesteps delimiter/encoding bugs and makes the value self-describing for debugging in DevTools.

**Alternatives considered:**
- *Comma-joined string:* rejected — collision-prone with squad names like "VALLADOLID, S.A." (hypothetical).
- *Indexed localStorage keys (`teamFilter.0`, `teamFilter.1`, …):* rejected — adds bookkeeping for ordered inserts/removals that JSON does for free.

**Shape:** `["CLUB X A", "CLUB X JUNIOR"]`. Empty array or missing key → "Todos". Stale names (not present in current squad list) are filtered out at hydration time without erasing the rest of the array.

### D4 — "Todos" is a real checkbox, not a separate header

**Choice:** The first item in the dropdown is a "Todos" checkbox. Checking it selects every squad at once; unchecking any individual squad unchecks "Todos" (and vice versa when the last individual squad is toggled off, the "Todos" box stays visually unchecked but the filter behaves as Todos — see spec scenario "Toggling the last unchecked squad returns to Todos").

**Why:** Spec requires "Todos" to be a first-class selectable option (keyboard-accessibility scenario). A header-only "Todos" toggle would not be operable by keyboard without an extra tab stop. A single checkbox matches the existing multi-select mental model and keeps the keyboard flow to one logical group.

**Subtlety:** The "Todos" checkbox is **derived state**: it's checked iff every squad is currently selected. Toggling "Todos" either selects all or clears all (leaving an empty selection = behaves as Todos anyway). It never represents the "stale name" case directly — the underlying storage is still per-squad.

### D5 — Filtering happens in `useMemo`, no re-fetch

**Choice:** The visible rows are `useMemo(() => matches.filter(m => isVisible(m, selection)), [matches, selection])`. The `matches` prop is unchanged.

**Why:** Keeps the Calendario's existing sent-tracking and week-separator logic untouched. A `useMemo` is enough for the dozens-of-rows scale this surface sees; the cost of re-filtering on every keystroke is negligible. The header count is derived from the same memoised list.

### D6 — Dropdown UX: click-outside, Escape, ARIA combobox pattern

**Choice:** The dropdown is a custom disclosure (button + popup), not a native `<select>`. It uses `aria-expanded` on the trigger, `role="dialog"` (or `role="listbox"` with `role="option"`) on the popup, and handles Escape + outside-click to close.

**Why:** A native `<select>` cannot render checkboxes per option — the spec requires a checkbox-per-squad UI. A custom disclosure is the conventional accessible pattern for this (WAI-ARIA Authoring Practices "Combobox" / "Listbox" with checkboxes). Escape and outside-click match the patterns already established by `ShareInfoPanel` in `MatchesBoard.tsx`.

**Alternatives considered:**
- *Native `<details>` + checkboxes:* considered — simpler and zero-JS state for open/close. Loses programmatic focus management and fine-grained ARIA wiring; rejected to keep keyboard semantics predictable.

### D7 — No persistence on the home page

**Choice:** The Calendario dropdown is the only surface that filters. The home page (`(app)/page.tsx`) continues to surface the next upcoming fixture across all squads.

**Why:** The home page's role is "at-a-glance next thing"; over-filtering there would risk hiding the next fixture. The Calendario is where the user explicitly opts into a squad subset. If a future change wants the home page to honour the filter, it can read the same `localStorage` key — but that is out of scope here.

### D8 — CSS Module classes live next to existing ones

**Choice:** Add new classes (`.teamFilter`, `.teamFilterTrigger`, `.teamFilterPanel`, `.teamFilterOption`, `.teamFilterCheck`) to the existing `calendario.module.css`, reusing the existing colour tokens (`--surface`, `--border`, `--accent`, `--text-muted`) and the same shape vocabulary as `.sendWhatsButton` / `.todayPill` / `.infoPanel`.

**Why:** Keeps visual language consistent (matches the existing `.infoPanel` collapsible pattern) and avoids a new stylesheet just for one widget.

## Risks / Trade-offs

- **Squad name collisions across aliases** → Already handled by the existing `clubAliases` logic; we re-use it verbatim.
- **Stale localStorage entries if a squad is renamed** → Spec mandates that stale names are dropped at hydration without erasing the rest. We hydrate by intersecting the stored selection with the current squad list; entries that no longer exist are dropped silently.
- **`localStorage` quota / private-mode failures** → `getItem`/`setItem` already swallow errors and log them. Spec requires the UI to keep working without persisted state; the in-memory selection remains functional for the session.
- **Dropdown accessibility on mobile** → Touch + iOS Safari do not natively expose the same focus ring. We add a visible focus style on the trigger and on each checkbox (using `:focus-visible`).
- **Squad list re-renders on every match change** → Acceptable: the list is recomputed via `useMemo` keyed on `matches`, and squad counts are small.
- **No undo of the filter selection** → Acceptable per the spec; the user can re-check any squad individually.
- **Hydration mismatch if the server pre-renders with a filter applied** → The Calendario is `force-dynamic` and the dropdown is rendered post-hydration inside `MatchesBoard`. We render the dropdown with `hydrated` guard state (mirroring the pattern already in `ShareInfoPanel`) so the first paint matches what the server sends, then re-render with the persisted filter after `useEffect` reads `localStorage`. No SSR/CSR divergence visible to the user.

## Migration Plan

No server schema changes; no data migration; pure UI rollout. First deploy renders Calendario exactly as it does today. The dropdown only appears once the user has at least one squad in the agenda — on a fresh deploy it appears immediately if the user has fixtures, otherwise it appears when their first fixture arrives. Rollback is a revert of the change with no residual data.

## Open Questions

None. The "which teams show in the filter" question was resolved with the user before the proposal was written (own squads only). All other decisions (storage shape, dropdown UX, persistence surface) are conventional and reversible in code without changing the spec.