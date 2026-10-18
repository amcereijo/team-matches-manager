## 1. Shared club-team helper

- [x] 1.1 Create `web-app/src/lib/clubTeams.ts` exporting `clubAliases(name)` and `isClubMatch(team, aliases)` — extracted from `web-app/src/services/competition.ts` so the client component can import them without pulling the server-side axios/cheerio modules
- [x] 1.2 Update `web-app/src/services/competition.ts` to import the two helpers from `@/lib/clubTeams` and remove the local copies; keep the existing `normalize` helper local if it has no other consumers

## 2. Squad derivation and selection state in MatchesBoard

- [x] 2.1 In `web-app/src/app/(app)/calendario/MatchesBoard.tsx`, add a `squadList: string[]` memo computed from `matches` using `clubAliases(clubName)` + `isClubMatch`; sort the resulting distinct names (locale-aware, es) so the dropdown order is deterministic
- [x] 2.2 Add a `STORAGE_KEY = 'calendario.teamFilter'` constant alongside the existing `INFO_DISMISS_KEY`
- [x] 2.3 Add `useState<string[]>([])` for the persisted selection, plus a `hydrated` flag mirroring the `ShareInfoPanel` pattern; on mount, read `getItem(STORAGE_KEY)`, parse the JSON array, intersect with `squadList` to drop stale names, then set state
- [x] 2.4 Add a `useEffect` that writes the current selection to storage on change (skip the first render after hydration so we don't immediately overwrite stored value with the same data); JSON-encode the array; swallow errors silently per the spec's resilience requirement

## 3. Filter predicate and header count

- [x] 3.1 In `MatchesBoard.tsx`, add a `visibleMatches` memo: when `selection` is empty (Todos) return `matches`; otherwise return `matches.filter(m => selection.includes(m.local ?? '') || selection.includes(m.visit ?? ''))`
- [x] 3.2 Replace the existing `matches.map(...)` and `matches.length` references with `visibleMatches`; update the `noMatches` empty-state path so it triggers when `visibleMatches` is empty (and the squad list is non-empty, otherwise we render the original "no fixtures yet" branch)
- [x] 3.3 Verify the `<PageHeader count={...}>` reads from `visibleMatches.length` so the header reflects the filtered count

## 4. TeamFilter dropdown UI

- [x] 4.1 Add a `<TeamFilter>` block above the `.stickles` table inside `MatchesBoard.tsx`. Hidden when `squadList.length === 0`. Renders:
  - a `<button>` trigger with `aria-expanded`, `aria-haspopup="listbox"`, label "Equipos" + a count badge ("Todos" or "N de M")
  - a popup panel with `role="dialog"` containing a "Todos" checkbox (checked when `selection.length === squadList.length`) and one checkbox per squad in `squadList`
- [x] 4.2 Implement open/close state (`useState<boolean>(false)`); close on Escape and on outside click via a `useEffect` that listens on `document` and removes itself on cleanup; do not close when the click lands inside the panel
- [x] 4.3 Implement toggle handlers: toggling "Todos" either selects all or clears all; toggling an individual squad adds/removes it from `selection`; when the last individual squad is removed, leave it empty (behaves as Todos per the spec)
- [x] 4.4 Add `aria-label` to each checkbox that includes the squad name; add a visible focus style on the trigger and on each checkbox via `:focus-visible`

## 5. Styles

- [x] 5.1 In `web-app/src/app/(app)/calendario/calendario.module.css`, add the new classes: `.teamFilter` (container), `.teamFilterTrigger` (the button), `.teamFilterBadge` (count chip inside the trigger), `.teamFilterPanel` (popup), `.teamFilterOption` (row), `.teamFilterOptionCheck` (the checkbox), `.teamFilterOptionLabel` (text), `.teamFilterDivider` (between "Todos" and the per-squad list)
- [x] 5.2 Reuse the existing tokens (`--surface`, `--border`, `--text-muted`, `--accent`) and the shape vocabulary from `.infoPanel` / `.todayPill` so the dropdown matches the rest of the Calendario

## 6. Verification

- [x] 6.1 Manual: log in as a club with multiple squads → dropdown lists all squads, default is Todos, every fixture renders
- [x] 6.2 Manual: uncheck one squad → only that squad's fixtures disappear, header count drops accordingly, header uses singular/plural correctly
- [x] 6.3 Manual: select exactly one squad then reload → page opens with that squad checked and filtered; check a second squad and reload again → both checked after reload
- [x] 6.4 Manual: in DevTools, manually edit the `tmm.web.calendario.teamFilter` value to a squad name no longer in the agenda and reload → stale name ignored, dropdown shows the rest of the selection; original storage value is preserved (or trimmed of just the stale name)
- [x] 6.5 Manual: keyboard-only flow — Tab to trigger, Enter to open, Tab through checkboxes, Space to toggle, Escape to close, focus returns to the trigger
- [x] 6.6 Manual: clear localStorage for the site → reload → "Todos" default restored
- [x] 6.7 `npm run typecheck` and `npm run lint` pass; `npm run build` succeeds
- [x] 6.8 Spot-check that the home page (`(app)/page.tsx`) is unchanged and still shows the next upcoming fixture across all squads