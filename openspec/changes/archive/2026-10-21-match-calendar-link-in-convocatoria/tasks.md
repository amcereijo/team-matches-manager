## 1. Helpers

- [x] 1.1 Add `src/lib/calendarEvent.ts` with `isMatchReady`, `opponentFor`, `locationText`, `buildCalendarUrl`, `parseEventPath`, `parseKickoff`, `addMinutes`, `formatWallClockStamp`, `formatSpanishKickoff`, and `buildGoogleCalendarUrl`. `buildCalendarUrl` returns the landing-page URL (path segments, `encodeURIComponent` per segment) or `null` for a not-ready match. `buildGoogleCalendarUrl` returns `https://calendar.google.com/calendar/r/render?action=TEMPLATE&…` with per-parameter encoding and a wall-clock `dates` value.
- [x] 1.2 Add `src/lib/calendarUrl.ts` as a thin re-export of `buildCalendarUrl` / `buildGoogleCalendarUrl` so existing import paths keep working.

## 2. Landing page route

- [x] 2.1 Add `src/app/c/[...path]/route.ts` exporting a Next.js `GET` handler. It parses `<date>-<time>/<title>/<location>` from `params.path`, validates the kickoff, and returns HTTP 200 with `Content-Type: text/html; charset=utf-8` and `Cache-Control: public, max-age=300`. Fewer than three segments or a sentinel kickoff (`00:00`, `--:--`) returns HTTP 400 with a plain Spanish page.
- [x] 2.2 Render the page as plain server-rendered HTML with an inline `<style>` block — no script tag, no CSS module, no client component. It shows the title, the kickoff as a Spanish date and time (`sábado, 24 de octubre, 17:00`), the venue with a `Cómo llegar` map link, and one `📆 Añadir al calendario` link to the Google Calendar URL with `target="_blank" rel="noopener noreferrer"`.
- [x] 2.3 Render no `.ics` download affordance, no `webcal://` URL, and no `<script>` tag. Carry `<meta name="robots" content="noindex">`. Support light and dark system appearance via `prefers-color-scheme`.
- [x] 2.4 HTML-escape every user-derived value (title, date, venue, map URL, Google URL). These come from a scraped upstream feed and are not guaranteed free of `<`, `>`, or `"`.

## 3. Wire the link into the convocatoria

- [x] 3.1 In `src/app/(app)/calendario/MatchesBoard.tsx`, import `buildCalendarUrl` from `@/lib/calendarUrl`.
- [x] 3.2 Resolve `WEB_APP_BASE_URL` from `process.env.NEXT_PUBLIC_WEB_APP_URL`, falling back to `window.location.origin`. Declare it above `buildWhatsappUrl` so the reference is not in the temporal dead zone.
- [x] 3.3 Insert `\n\n📅 Añadir al calendario: <url>` into the convocatoria after the `<local> - <visit>` line and before the first numbered slot, only when `buildCalendarUrl` returns a URL. For a not-ready match the produced text is unchanged byte-for-byte.
- [x] 3.4 Document `NEXT_PUBLIC_WEB_APP_URL` in `.env.local.example`.

## 4. Verify

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm run build` all pass. _Note: `next build` failed with "You cannot have two parallel pages that resolve to the same path" while `page.tsx` and `route.ts` coexisted in `src/app/c/[...path]/`. Resolved by rendering the landing page from the route handler._
- [x] 4.2 Run `next start` and curl the real match URL from the bug report (`/c/24%2F10%2F2026-17%3A00/Game%20with%20MAMUTS%20D/…`). Confirm HTTP 200, `text/html`, the Spanish kickoff `sábado, 24 de octubre, 17:00`, the venue with the `Cómo llegar` link, and the button href. _Verified._
- [x] 4.3 Assert the page contains no `.ics` href, no `download` attribute, no `webcal://` URL, and no `<script>` tag. _Verified._
- [x] 4.4 Assert the Google Calendar href matches the hand-verified template exactly: path `/calendar/render` (not `eventedit`, not `/r/render`), `action=TEMPLATE`, `dates` with `Z` on both halves, `ctz=Europe/Madrid` present, and per-parameter encoding including the map URL's `?`/`&` and the `/` inside `dates` as `%2F`. _Verified against the live dev server._
- [x] 4.5 Assert `dates` is a UTC pair with `Z` on **both** halves. `24/10/2026 17:00` → `dates=20261024T150000Z/20261024T163000Z` (CEST, UTC+2) and `15/02/2026 18:30` → `dates=20260215T173000Z/20260215T190000Z` (CET, UTC+1). Same wall clock, different absolute instant. _Verified._
- [x] 4.6 Fetch the generated Google URL unauthenticated and assert Google accepts it: HTTP 200, redirect to sign-in, and the **complete query string preserved** in the `continue` parameter — `action`, `text`, `dates`, `ctz`, `details`, `location` all present and unmodified. _Verified for four URL variants (both paths, literal `/` vs `%2F`, with and without a parenthetical map URL): all accepted identically, so neither the path nor the encoding is a factor._
- [x] 4.7 Sentinel kickoff `/c/24%2F10%2F2026-00%3A00/T/Loc` returns HTTP 400 with no button rendered. _Verified._
- [x] 4.8 Manually verify on Android through the ngrok tunnel: open the Calendario, tap Enviar, send to a WhatsApp conversation, tap the link from the phone, confirm the landing page renders, then tap `📆 Añadir al calendario` and confirm Google Calendar opens with the event prefilled and **no file is downloaded**. Also confirm the URL preview in WhatsApp is one unbroken line. _Verified by the user on a physical Android device. This check drove the four rounds of URL correction recorded in Decision 2 / Decision 2a: the timezone encoding shipped wrong three times and only a real device exposed it._
- [x] 4.9 Manually verify on a desktop browser: the button opens a Google Calendar tab with the event-creation form prefilled. _Verified by the user. This check narrowed the final bug to the `dates` encoding rather than Android app routing._