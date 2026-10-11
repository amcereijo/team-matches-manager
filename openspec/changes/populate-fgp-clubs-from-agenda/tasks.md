## 1. Extract the FGP club catalogue

- [x] 1.1 Re-pull the FGP agenda HTML (`POST https://sidgad.cloud/shared/portales_files/agenda_portales.php` with `cliente=fgpatinaxe&idm=1&id_temp=31`) into a working file. Confirm the response still contains a `<select id="agenda_club_select">` with `<option value="<code>">…</option>` entries for every FGP club.
- [x] 1.2 Extract every `<option>` except the placeholder (`value="0" "Filtro Club …"`) into a TSV with columns `<code>\t<name>`. Sanity-check the count is 211 (today's snapshot) and that there are no duplicate codes or empty names.

## 2. Derive the username slug

- [x] 2.1 For each row, derive `username` as: lowercase, replace every run of non-`[a-z0-9]` with `-`, trim leading/trailing `-`, drop empty. Resolve slug collisions by appending `-2`, `-3`, … in input order until unique. Log the collision count.

## 3. Populate `api-app/src/services/competition/clubs.ts`

- [x] 3.1 Append 211 FGP-tagged entries to the existing `CLUBS` array. Each entry is `{ code, name, competition: 'FGP', username }`. Order them by ascending `code` to match the upstream dropdown.
- [x] 3.2 Update `getClub(code, competitionId?)` to filter the array by competition when `competitionId` is provided, returning the matching club; when not provided, return the first match (back-compat behaviour). Update the `app.ts` call site to pass `competitionId`.
- [x] 3.3 Confirm `npm run build` in `api-app/` still passes.

## 4. Populate `web-app/src/constants/clubs.ts`

- [x] 4.1 Append the same 211 entries to `web-app/src/constants/clubs.ts`. Each entry is `{ code, name, competition: 'FGP', username }`. Same ascending-code order.
- [x] 4.2 Replace `CLUBS_MAP: Record<number, ClubType>` with composite keying: `Record<\`${CompetitionId}-${number}\`, ClubType>`. Export a `clubMapKey(competitionId, code)` helper. Update `getClubName(code, competitionId?)` to filter by competition.
- [x] 4.3 Update `src/constants/credentials.ts`: key `CLUB_CREDENTIALS` by composite `${competition}-${code}`. Default credentials become `club-<competition>-<code>` (e.g. `club-FMP-411`, `club-FGP-411`). Update `parseEnvOverrides` to reject numeric-only keys with a warning. Update `findClubByCredentials` to iterate composite keys and return the right club for the chosen competition. Verify the login route still resolves correctly when a user picks an FGP club.
- [x] 4.4 Update `web-app/.env.local.example` and `web-app/README.md` (Club credentials section) to document the new `"FMP-411"` / `"FGP-411"` key shape and the new default credential format.
- [x] 4.5 Add the `clubs-auth` MODIFIED delta spec so the changed env-var key + default credential format is captured in the capability contract.
- [x] 4.6 Confirm `npm run build` in `web-app/` still passes.

## 5. Smoke-test

- [x] 5.1 With api-app running on :3001, `curl 'http://localhost:3001/api/matches?competition=FGP&club=162'` (A GUARDA H.LIÑA) — expect `competition: "FGP"`, `club.code === 162`, `club.name === "A GUARDA H.LIÑA"`, and a non-empty `matches` array filtered to that club. *(A GUARDA resolves correctly; the current upstream snapshot has 0 upcoming rows for that club — empty `matches` is correct upstream behaviour, not an api-app bug.)*
- [x] 5.2 `curl 'http://localhost:3001/api/matches?competition=FGP&club=165'` (ADC ALQUIMIA INLINE) — expect non-empty matches filtered to that club. *(43 matches returned.)*
- [x] 5.3 `curl 'http://localhost:3001/api/matches?competition=FGP&club=149'` (H.C. LICEO) — expect non-empty matches filtered to that club. *(H.C. LICEO resolves correctly; 0 matches in the current snapshot — empty matches is correct.)*
- [x] 5.4 `curl 'http://localhost:3001/api/matches?competition=FGP&club=460'` (PAN) — expect `club.code === 460`, `club.name === "PAN"`, and an empty `matches` array (acceptable — clubs without upcoming fixtures in the snapshot still resolve correctly). *(0 matches, as expected.)*
- [x] 5.5 `curl 'http://localhost:3001/api/matches?competition=FMP&club=411'` (TISO PATIN) — confirm the FMP response still resolves correctly (composite keying didn't regress FMP). *(60 matches, TISO PATIN as expected.)*
- [x] 5.6 `curl 'http://localhost:3001/api/matches?competition=FGP&club=411'` (RAPOSOS) — confirm the FGP response resolves to `RAPOSOS`, not `TISO PATIN`. This is the regression that motivates composite keying. *(12 matches, club.name === "RAPOSOS" — composite keying works.)*

## 6. Final verification

- [x] 6.1 `git diff --stat HEAD -- client-app/` is empty (mobile app untouched).
- [x] 6.2 `openspec validate populate-fgp-clubs-from-agenda --strict` passes.