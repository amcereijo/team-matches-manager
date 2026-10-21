## Why

Today the WhatsApp "convocatoria" message built by `buildWhatsappUrl` in the Calendario tells players *when* and *where* the match is, but offers no way to save it to their personal calendar without leaving WhatsApp and retyping the date, time and address. Adding a one-tap "Add to calendar" link inside the message removes that friction and makes it more likely the match lands on everyone's calendar — the single biggest driver of attendance.

## What Changes

- Augment `buildWhatsappUrl` to insert a `📅 Añadir al calendario: <url>` line in the convocatoria text, placed **after** the `<local> - <visit>` line and **before** the first numbered slot of the player list.
- The inserted line appears **only** when `isMatchReady(row)` is true. Pending matches keep their current text exactly.
- The link points at a new `/c/[...]` route that renders a standalone HTML landing page: the match title, the kickoff as a Spanish date and time, the venue with a `Cómo llegar` map link, and one prominent `📆 Añadir al calendario` button.
- The button is a plain link to `https://calendar.google.com/calendar/render?action=TEMPLATE&…`. It opens Google Calendar on Android and a browser tab on desktop. **No file is downloaded on either.**
- The URL uses **path segments** (`/c/<date>-<time>/<title>/<location>`) so WhatsApp displays it as a single unbroken line. The original query-string form was visually broken by WhatsApp's `&`-wrap, and map URLs contain `&` themselves.
- `dates` carries a **real UTC instant pair** with `Z` on both halves, and `ctz=Europe/Madrid` travels alongside it to declare the event's home zone. The template is pinned to a link verified working by hand: `/calendar/render` (not `eventedit`, which the Android app drops), UTC digits (not wall clock, which opens an empty editor).
- Production deployments set `NEXT_PUBLIC_WEB_APP_URL` to the deployed origin; local development falls back to `window.location.origin`.

### Rejected alternatives (all field-tested, not theoretical)

| Mechanism | Why not |
|---|---|
| Google Calendar `r/eventedit` link in the message body | Worked on desktop; on Android the Calendar app opened on the day view and dropped every parameter. |
| `.ics` served over `https://` | Universal, but Android and iOS **download the file**, adding a download-notification or file-manager step. User feedback: "I don't want any ics file". |
| `webcal://` button on the landing page | Inert on Android Chrome, and prompts "choose an application" on desktop. User feedback: "the button in web does nothing". |

## Capabilities

### New Capabilities

None. The behavior is a strict additive change to the convocatoria produced by an existing capability.

### Modified Capabilities

- `match-send-tracking`: add requirements covering the convocatoria's calendar-link line, the landing page, and the Google Calendar URL shape.

## Impact

- **Code:**
  - `src/app/(app)/calendario/MatchesBoard.tsx` — insert the calendar line in `buildWhatsappUrl`; resolve `WEB_APP_BASE_URL` from `NEXT_PUBLIC_WEB_APP_URL`.
  - `src/lib/calendarEvent.ts` — **new** — path building, path parsing, kickoff validation, Spanish date formatting, and the Google Calendar URL.
  - `src/lib/calendarUrl.ts` — **new** — thin re-export so existing imports keep working.
  - `src/app/c/[...path]/route.ts` — **new** — public GET handler rendering the landing page.
  - `src/lib/matchDate.ts` — unchanged; an interim DST-conversion helper was added for the UTC form of `dates` and removed again once `dates` switched to the wall-clock form.
- **APIs:** one new public route, `GET /c/[...]`. No auth, no state, no database.
- **Dependencies:** none. `Intl.DateTimeFormat` (already used by `nowInMadrid`) covers the timezone conversion.
- **Behavior change:** recipients without Google Calendar get the Google web form rather than Apple Calendar. Accepted trade for avoiding the file download.
- **Edge caching:** the response is fully determined by the path, so Vercel caches it at the CDN with `Cache-Control: public, max-age=300`.
- **Privacy:** the route is public by necessity — recipients are not club admins and cannot authenticate. It logs nothing and holds no state.