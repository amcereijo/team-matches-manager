## Context

The Calendario's `MatchesBoard.tsx` builds the WhatsApp convocatoria text inside `buildWhatsappUrl(game, clubName)`. Today that helper returns a `https://wa.me/?text=…` URL whose body is the match header followed by an empty player-list scaffold.

The new requirement is to extend that helper so the text it produces also contains a one-tap "Add to calendar" link, *but only* for ready matches.

Getting that link to actually work on a phone took four attempts, all of them driven by field feedback:

1. **Google Calendar `r/eventedit?action=TEMPLATE` in the message body.** Worked on desktop. On Android the Google Calendar app opened on the day view and silently dropped every query parameter. Adding `action=TEMPLATE` (which Google's docs include) fixed it for one reporter and not for us — the app registers no App Link handler for `r/eventedit`.
2. **Same link, but path-encoded behind a `/c/...` URL so WhatsApp would not wrap it.** Solved the wrapping, kept the Android dead end.
3. **`.ics` served from our own `/c/...` URL.** Universal format, but `https://` + an iCalendar payload makes Android and iOS download the file rather than hand it to the calendar app. Rejected: "I don't want any ics file".
4. **`webcal://` button on a landing page.** Correct scheme, but inert on Android Chrome and it prompts "choose an application" on desktop. Rejected: "the button in web does nothing".
5. **Landing page whose button is a plain Google Calendar link.** This is what ships. The first two versions of that URL got the timezone encoding wrong twice — see Decision 2.

See `proposal.md` for the motivation (Why / What Changes) and `specs/match-send-tracking/spec.md` for the normative requirements.

## Goals / Non-Goals

**Goals:**
- A link that opens the user's calendar app on Android, and a browser tab on desktop, with **no file download** on either.
- A URL short enough (and free of `&` characters) that WhatsApp displays it as a single unbroken line in the message preview, so the recipient can long-press and tap it as one unit.
- No new dependency. No server-side I/O: the route renders a page from its path segments.
- The web-app's existing date helpers (`parseSidgadDate`, `clubAliases`/`isClubMatch`) are reused.
- Time-zone correctness: the kickoff is converted to a real UTC instant and emitted as a `Z`-suffixed pair, with `ctz=Europe/Madrid` declaring the event's home zone. Every calendar app resolves the same absolute moment regardless of the viewer's own zone setting.
- Production deployments use the deployed origin (`NEXT_PUBLIC_WEB_APP_URL`) so the link works on a recipient's phone — not `localhost:3000`.

**Non-Goals:**
- No iCalendar document and no `.ics` download anywhere. Explicitly rejected by the user.
- No `webcal://` scheme. Explicitly rejected after field testing.
- No calendar-agnostic destination: this links to Google Calendar, so a recipient without it (an iOS user, say) gets the Google web form. Accepted trade for avoiding the download.
- No persistent server state. The route is a pure function of its path and MUST NOT require a session.
- No change to the Enviar button, sent-tracking flow, or `ShareInfoPanel` copy.

## Decisions

### Decision 1 — Calendar URL helpers live in `src/lib/calendarEvent.ts`

`src/lib/calendarUrl.ts` is a thin re-export so existing imports keep working. The real surface is `src/lib/calendarEvent.ts`:

```ts
buildCalendarUrl(game: Game, clubName: string, baseUrl: string): string | null
buildGoogleCalendarUrl(event: MatchEvent): string | null
```

The first produces the landing-page URL that goes into the WhatsApp message, returning `null` for a not-ready match so the caller omits the line. The second produces the Google Calendar URL that the landing page's button points at.

Both live together because they are two halves of one feature — the path encoding and the Google URL encoding — and splitting them across two files meant importing `parseKickoff`/`parseSidgadDate` into both for no benefit.

`baseUrl` is passed in rather than read from `process.env` inside the helper, so it stays a pure function. The Calendario component resolves it from `NEXT_PUBLIC_WEB_APP_URL` (production) or `window.location.origin` (development).

### Decision 2 — `dates` is a UTC pair with `Z`, and `ctz` travels alongside it

Google's `dates` parameter takes a pair of timestamps, and the shapes are not interchangeable. The three we shipped, and what each did in the field:

| Attempt | `dates` | `ctz` | Result |
|---|---|---|---|
| 1 | `20261024T150000Z` | `Europe/Madrid` | Event landed 2h off in October, 1h off in February; on Android nothing was created. |
| 2 | `20261024T170000` (wall clock, no `Z`) | `Europe/Madrid` | Editor opened with **no date and nothing to save**. |
| 3 | `20261024T150000Z` | *omitted* | URL accepted by Google, but the Android result was still not confirmed. |
| **4** | `20261024T150000Z` | `Europe/Madrid` | **Confirmed shape** — matches a link verified working by hand. |

The rule from Google's own parser: **the range is treated as UTC only when both halves end with `Z`.** Wall-clock digits are read as the viewer's zone, which is wrong for a Spanish club fixture.

`ctz=Europe/Madrid` stays alongside the UTC pair. It does not shift the instant — the `Z` already fixes that — it declares which zone the event conceptually belongs to. Attempt 3 removed `ctz` on the theory that it conflicted with the UTC range. That reasoning was wrong: Google accepts and preserves both together, and a hand-verified working link carries both. Removing a parameter on a hunch, without a failing test to justify it, is what produced a wasted round here.

The path also changed from `/calendar/r/render` to `/calendar/render`. Both are accepted by Google; the shorter form is what the verified link uses, so we match it rather than the variant we invented.

The Madrid → UTC conversion is `madridKickoffAsUtc`, a private helper in `calendarEvent.ts`. It cannot reuse `parseSidgadDate`, which stores Madrid wall-clock components in the UTC slots of its returned `Date` by design; `toISOString()` on that would emit the wall clock as if it were UTC. The helper asks `Intl.DateTimeFormat({ timeZone: 'Europe/Madrid' })` what wall clock a UTC guess actually shows in Madrid and subtracts the difference — DST-correct with no per-season table.

### Decision 2a — What this cost, and what we should do differently

Four rounds on this integration. The failure mode was consistent: every attempt produced a URL that looked plausible and passed every local assertion, because a malformed timestamp is still internally consistent. Nothing in the code signals "wrong".

Two process failures worth recording:

1. **We changed code before isolating the variable.** The desktop-vs-Android question — "does the button work on desktop?" — was the single most useful piece of information in the whole exchange, and it arrived only after two wrong fixes. Asking it first would have narrowed the space immediately.
2. **We removed `ctz` on a theory instead of on evidence.** Attempt 3 was a change with no failing test to justify it. The right move was to keep the last known-good shape and change exactly one thing.

Going forward: when an integration's correctness can only be observed on the real service, pin to a hand-verified reference and treat "works on my machine" claims as provisional until the device test passes. A real device in CI would have caught attempts 1 and 2 immediately and saved roughly half the rounds.

### Decision 3 — Per-parameter encoding on the Google Calendar URL

`encodeURIComponent` is applied to each parameter value individually, never to the assembled URL. Encoding the whole thing would escape the `&` separators and produce a URL Google cannot parse — and the venue's map URL contains its own `?` and `&`, which is exactly the case that breaks first.

### Decision 4 — Server route is a pure path-to-page formatter

The route at `/c/[...path]` does no I/O. It reads the path segments, validates the kickoff, builds the Google Calendar URL, and returns an HTML page. No scraping, no auth, no DB. Vercel caches it at the CDN edge because the response is fully determined by the path.

Rejected alternatives:
- **Re-scraping the agenda server-side.** Adds latency, a network dependency, and a request per WhatsApp recipient. All the data is already in the client when the Enviar button is built, so it travels in the path.
- **A database lookup keyed by a match id.** Would need a slug that survives club renames and season changes, and would break the zero-infrastructure property. The path is self-contained, which also means the URL cannot go stale.

### Decision 5 — Opponent detection reuses existing helpers

The "opponent = the team that is NOT us" rule is a tiny piece of logic, but it has to match the existing alias rules used in `services/competition.ts` for agenda filtering and in `MatchesBoard.tsx` for the team-filter dropdown. Reusing `clubAliases(name)` + `isClubMatch(team, aliases)` from `lib/clubTeams.ts` keeps the three surfaces agreeing on "what counts as my team".

Rejected alternative: a separate `getOpponent(game, clubName)` helper would invite drift.

### Decision 6 — Match duration is fixed at 90 minutes

A direct reading of the user's instruction. Single line, no club name, no match number. Keeps the calendar entry short and unambiguous.

The `duration` query param is included anyway (instead of hardcoded 90) so the route is general — a future spec that wants variable durations won't have to change the wire format.

### Decision 7 — Landing page escapes all user-derived text

Title, date, venue and map URL come from a scraped upstream feed, so none of them can be assumed free of `<`, `>`, `"` or `'`. The page HTML-escapes every one of them before interpolation, and HTML-escapes the Google Calendar URL as an attribute value. Without this, a venue name containing a quote would break out of the `href` attribute.

### Decision 8 — URL uses path segments, not query parameters

The original design used `?title=…&date=…&time=…&duration=…&location=…&map=…&tz=…` as query parameters. That failed in two ways when tested in a real WhatsApp conversation:

1. **WhatsApp wraps long URLs at every `&` character.** Even though the recipient can technically tap the link, the visual wrap makes it confusing and breaks the URL preview metadata. The link preview rendered as multiple paragraphs of broken URL fragments in the conversation.
2. **Map URLs often contain `&` themselves** (e.g. Google Maps URLs with multiple `&` parameters). Encoding `%26` doesn't help because WhatsApp's wrap logic operates on the *displayed* URL after percent-decoding — `%26` is decoded to `&` and then becomes a wrap point.

The fix is path-based URLs with no `&` or `?` anywhere:

```
/c/<date>-<time>/<title-slug>/<location-slug>
```

Path segments are decoded only by the route, not by the display layer. WhatsApp sees a clean URL with only `/` separators (which it does not break on). The resulting URLs are 60-90 chars even with map URLs included — short enough to display in full.

Map URLs that contain `/` are URL-encoded as `%2F` inside the location-slug. The route decodes them back when building the iCal document. The encoded `%2F` is also safe in WhatsApp previews.

Rejected alternatives:
- **Shorter hash-based URLs (`/c/<base64>`)** — compresses everything but the URL becomes opaque, ugly in previews, and prevents the user from recognizing the event in the chat.
- **Drop the location entirely** — defeats the purpose of the calendar entry (the venue is the most useful info in a calendar entry).
- **Use a hosted URL shortener** — adds a third-party dependency and a privacy concern (the shortener sees every recipient's IP).

### Decision 9 — Production origin via `NEXT_PUBLIC_WEB_APP_URL`

The recipient of the WhatsApp link is on a different device. `window.location.origin` on the recipient's phone resolves to *their* localhost (a loopback with no server), not the web-app. So a link like `http://localhost:3000/...` 404s for every non-developer.

The fix is a build-time env var `NEXT_PUBLIC_WEB_APP_URL`. Next.js exposes any `NEXT_PUBLIC_*` env var to client code at build time, replacing the value into the bundle. Production deployments set this to `https://team-matches-manager.vercel.app` (or whatever the deployed origin is). Local development leaves it unset and falls back to `window.location.origin`, which is fine for testing against a tunnel (ngrok, Cloudflare Tunnel) or a Vercel preview deploy.

### Decision 10 — Landing page whose button is a Google Calendar link

The WhatsApp message could not carry a `calendar.google.com` link directly: that URL is long and full of `&` separators, and WhatsApp wraps it mid-token, rendering the link as broken fragments that are no longer tappable as one unit. So the message carries a short path-based URL (`/c/<when>/<title>/<location>`, no `&`) that lands on a landing page.

What the landing page's button should *do* took three attempts:

1. **`https://` -> `.ics` payload.** Android and iOS **download the file** rather than handing it to the calendar app, so the recipient taps a download notification or digs in a file manager first. Reported back as "I don't want any ics file".
2. **`webcal://` button.** The scheme Android and iOS both register with calendar apps, and it opens the import sheet directly. Implemented as a JS-driven button that assembles the URL from `window.location.host`. Reported back as "the button in web does nothing" on Android Chrome, and it also opens an unwanted "choose an application" prompt on desktop.
3. **Google Calendar link.** A plain `<a href="https://calendar.google.com/calendar/r/render?action=TEMPLATE&...">`. Opens the calendar app on Android and a browser tab on desktop, with no download on either. This is what ships.

The trade-off versus approaches 1 and 2 is that the button is a plain link rather than a device-native handoff, so a recipient without Google Calendar (an iOS user, say) gets the Google web form instead of Apple Calendar. The user explicitly chose this over a file download, so it is the accepted trade.

Rejected alternative worth noting: a user-agent check in the button to pick `webcal://` on mobile and Google on desktop. That is the kind of thing that makes a button silently inert — Chrome on Android does not register `webcal://`, and UA sniffing is brittle across in-app browsers anyway.

### Decision 11 — `r/render`, not `r/eventedit`

The first attempt at this whole change used `https://calendar.google.com/calendar/r/eventedit?...`, which is what Google's current API docs publish. It worked on desktop and did nothing on Android. Adding `action=TEMPLATE` fixed it for one reporter and not for us.

The underlying reason: the Google Calendar **Android app** registers no App Link handler for the `r/eventedit` path, so Android falls back to a Browser Link, opens the app on the day view, and drops the query string. `r/render?action=TEMPLATE` is the older path the Android app does honour. Both work in desktop browsers.

This is the kind of detail that gets "cleaned up" by a future reader who sees `eventedit` in Google's docs and assumes it is the canonical form, so the choice is normative in the spec with the Pixel 8 / Android 15 reproduction attached.

### Decision 12 — Landing page rendered from the route handler, not a `page.tsx`

Next.js does not allow a `page.tsx` and a `route.ts` to resolve to the same path (`You cannot have two parallel pages that resolve to the same path`). An earlier cut hit this at build time.

Two options were on the table:

- **Content-negotiate in the route** — keep `route.ts`, return HTML for `Accept: text/html` and iCal otherwise. Implemented first, then abandoned when the `.ics` path was dropped: with only one representation left there is nothing to negotiate.
- **Drop `route.ts`, keep `page.tsx`** — a normal server component page.

`route.ts` was kept because it is the smaller surface: the page is ~50 lines of HTML with a `<style>` block, needs no React tree, and `page.tsx` would have required a separate CSS module for no benefit. The practical consequence is that the page is plain server-rendered HTML and cannot use CSS modules or client components — which is fine, since it has no interactivity once the `webcal://` button was dropped.

### Decision 13 — Echoed paths are re-encoded before use in the page

Next.js hands `params.path` to the handler **already URL-decoded**. Echoing it verbatim into an `href` would emit `/c/24/10/2026-17:00/Game with MAMUTS D/...` — raw spaces and slashes that break the link. The route re-encodes each segment with `encodeURIComponent` before composing any path.

Caught by inspecting real HTTP responses from a running server, not by reading the code. Worth remembering that catch-all route params arrive decoded.

## Risks / Trade-offs

- **[Recipients without Google Calendar get the Google web form]** → an iOS user who has never installed Google Calendar lands on a web page rather than Apple Calendar, and has to sign in. This is the accepted cost of refusing the `.ics` download: there is no single URL that both avoids a download and is calendar-agnostic. Mitigation: the page is a normal, readable HTML page, so the recipient can copy the date and venue by hand even if the button does nothing useful for them.
- **[Google can change or retire the endpoint]** → the URL shape is community-observed to keep working but is not part of a contractual API. Mitigation: the URL is built in exactly one place (`buildGoogleCalendarUrl`), so a change is a one-line edit plus a spec update. Two traps are documented so a future reader does not "correct" the template into a broken form: `eventedit` instead of `render` (Android drops the query string), and wall-clock digits in `dates` instead of UTC instants (the editor opens empty). Both were shipped and both were caught only on a real device.
- **We have no automated guard for this class of bug** → the Google URL is a third-party grammar discovered by trial, and every local check passed for all four attempts. Mitigation: the failure modes and their symptoms are pinned in the spec so a regression is recognisable. The durable fix is a device check in CI, not more unit assertions.
- **[WhatsApp could reintroduce the `&`-wrap]** → if WhatsApp changes how it wraps long URLs, a future path with a segment that decodes to something long could break again. Mitigation: the URL is asserted to contain no `&` or `?` in the verification step, so a regression is caught before it reaches a recipient.
- **[HTML injection from scraped upstream data]** → venue and team names come from a third-party feed. Mitigation: every interpolated value is HTML-escaped in the route, pinned by a requirement, and no `dangerouslySetInnerHTML` or unescaped interpolation is used.
- **[Recipient privacy]** → the route is public by necessity, since recipients are not club admins and cannot authenticate. Mitigation: the route logs nothing and holds no state; this is a requirement, not just a convention.
- **[The URL is frozen at send time]** → if the federation moves the venue after the convocatoria goes out, the landing page still shows the old one. Mitigation: accepted. Venues change rarely relative to how often messages are re-sent, and a DB-backed route would reintroduce the infrastructure this design avoids.
- **[No change to the Enviar button or its analytics]** → the sent-tracking flow is untouched, so we get no signal on how many recipients actually use the calendar link. Mitigation: accepted for v1; adding click tracking would require the recipient to be identified, which the privacy requirement forbids.

## Migration Plan

Additive; ships with the next deploy. Rollback is a revert of four files:

1. `src/app/c/[...path]/route.ts` — delete (the new route)
2. `src/lib/calendarEvent.ts` — delete (the new helper module)
3. `src/lib/calendarUrl.ts` — delete (the re-export shim)
4. `src/app/(app)/calendario/MatchesBoard.tsx` — revert the import and the calendar line in `buildWhatsappUrl`

`NEXT_PUBLIC_WEB_APP_URL` in `.env.local.example` is documentation only and can stay or go independently. `lib/matchDate.ts` is untouched by the final version — the DST conversion helper that briefly lived there was removed again once `dates` switched to the wall-clock form.

## Open Questions

None. The user has explicitly chosen, across four rounds of field feedback:
- Keep the landing page.
- Drop the `.ics` download entirely.
- Drop the `webcal://` button (it did nothing on Android).
- Use a Google Calendar link for the button, pointing at `r/render?action=TEMPLATE` rather than `r/eventedit`.
- Fixed 90-minute duration.
- Title is `Game with <opponent>`, no club name.
- Line placement: between the `Local - Visit` line and the first numbered slot.
- Omit the line for pending matches.
