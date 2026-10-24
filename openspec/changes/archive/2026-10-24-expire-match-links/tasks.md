## 1. The expiry rule

- [x] 1.1 Add `isLinkExpired(kind, payload, now?)` to `src/lib/shortLink.ts`: expired when a `match_calendar` link's fixture date is before today in `Europe/Madrid`, never for a `team_calendar` link, and expired when the date cannot be parsed
- [x] 1.2 Compare calendar days, not instants — build a day key from the UTC fields of `parseSidgadDate(...)` and `nowInMadrid()` so the hour and any DST shift play no part
- [x] 1.3 Add `expired` to `LinkView` and compute it in `linkView()`

## 2. Store

- [x] 2.1 Extract the payload parsing out of `rowToLink()` so the sweep and the view can read a payload without building a whole link
- [x] 2.2 Add `expireStaleMatchLinks(club)` to `src/lib/server/linkStore.ts`: deactivate the club's active `match_calendar` links whose fixture date is over, and leave the rows in place
- [x] 2.3 Make `resolveLink()` return `null` for an expired match link — read-only, no row written
- [x] 2.4 Make `setLinkActive(club, hash, true)` refuse a match link whose date is over, and tell the caller why

## 3. Management API

- [x] 3.1 Sweep the club's expired match links in `POST /api/links` before storing anything
- [x] 3.2 Refuse a create request for a fixture whose date is already past, with `400` and a named reason
- [x] 3.3 Answer `409` for a refused re-activation of an expired link, keeping the `404` for an unknown link
- [x] 3.4 Keep the Enviar flow working: a refused create must fall back to the canonical URLs as any other failure does

## 4. The /links page

- [x] 4.1 Show an expired match link as "Expirado" and offer no re-activation for it
- [x] 4.2 Say on the page that a match link stops working once its date is over, next to the existing five-minute cache note

## 5. Verification

- [x] 5.1 `npm run typecheck`, `npm run lint` and `npm run build` pass
- [x] 5.2 Check that a link for today's fixture resolves all day and stops resolving the next day
- [x] 5.3 Check that creating a link deactivates the club's expired match links, and leaves another club's links alone
- [x] 5.4 Check that an expired link cannot be re-activated and that a past-dated create is refused
- [x] 5.5 Update the README (short links section: expiry, cleanup, the API's new answers)
