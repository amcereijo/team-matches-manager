import type { ClubType, Game, Squad } from '@/types';
import type { CompetitionId } from '@/constants/competitions';
import { ourSide } from '@/lib/clubTeams';
import { parseSidgadDate } from '@/lib/matchDate';

export const MADRID_TZ_ID = 'Europe/Madrid';
export const MATCH_DURATION_MINUTES = 90;

/**
 * Path prefix for the calendar landing page. The WhatsApp link points here,
 * not at Google Calendar directly, because a long query-string URL gets
 * visually broken by WhatsApp's `&`-wrap and the recipient has to reach a
 * `calendar.google.com` link from a real page for the OS/app routing to
 * behave.
 */
export const CALENDAR_PATH_PREFIX = '/c';

/**
 * Path prefix for the public team calendar page. This is what the WhatsApp
 * convocatoria links to: the recipient taps it and sees every upcoming fixture
 * for their squad, rather than the single match the message is about.
 *
 * Unlike `/c`, this path carries an *identity* rather than a payload — the
 * page fetches live upstream data instead of rendering what the address
 * spells out. See design.md D1.
 */
export const TEAM_CALENDAR_PATH_PREFIX = '/t';

// Sidgad's "kickoff not published yet" sentinels.
const TIME_SENTINELS = [/^00:?00$/i, /^--:?--$/];

export type KickoffParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type MatchEvent = {
  title: string;
  date: string;
  time: string;
  location: string;
};

/** Match is ready iff it has a date AND a non-sentinel time. */
export function isMatchReady(game: Game): boolean {
  if (!game.date) return false;
  if (!game.time) return false;
  const trimmed = game.time.trim();
  if (!trimmed) return false;
  if (TIME_SENTINELS.some((re) => re.test(trimmed))) return false;
  return /\d/.test(trimmed);
}

/**
 * The team that is NOT one of the user's clubs.
 *
 * "Which side is ours" is decided by `ourSide`, the shared helper that
 * consults the upstream `param_game` code FIRST and falls back to the club's
 * name aliases. Code-first matters: the federation's squad names do not
 * reliably derive from the catalogue's club names (`ALAMEDA DE OSUNA A` is
 * club 386's `ALAMEDA OSUNA HP`), and a name-only test that does hit can pick
 * the wrong side when a rival shares the club's name.
 */
export function opponentFor(game: Game, club: ClubType): string {
  const side = ourSide(game, club);
  if (side === 'local') return (game.visit ?? '').trim();
  if (side === 'visit') return (game.local ?? '').trim();
  return (game.visit ?? '').trim();
}

/**
 * Venue text, with the map URL appended in parentheses when present.
 */
export function locationText(game: Game): string {
  if (!game.location) return '';
  return game.map ? `${game.location} (${game.map})` : game.location;
}

/**
 * The squad a convocatoria is for: the side of the fixture that belongs to the
 * user's own club, together with the league that side plays in.
 *
 * This is deliberately NOT the club. A club like `HL NOROESTE` can field
 * several squads (`HL NOROESTE A`, `HL NOROESTE B`) and each plays its own
 * fixtures; a player convoked for `NOROESTE A` wants that squad's calendar,
 * not the whole club's. `clubAliases` is what bridges the gap — the catalogue
 * stores one base name per club, and the fixtures carry the suffixed squad
 * names.
 *
 * The LEAGUE is part of the answer because a squad name alone does not
 * identify a team: the same club fields `DOMINICOS A` in ALEVÍN GRUPO A and
 * in SENIOR MASCULINO, and those are two different teams with two different
 * fixture lists. Without the league, the squad calendar shows the fixtures of
 * every league the name appears in.
 *
 * Returns `null` only when neither side is usable at all, which is the signal
 * for the caller to omit the link line entirely.
 */
export function squadFor(game: Game, club: ClubType): Squad | null {
  const side = ourSide(game, club);
  if (side === 'local' && game.local) return { name: game.local, league: game.league };
  if (side === 'visit' && game.visit) return { name: game.visit, league: game.league };
  // Defensive: neither side identified as ours (an upstream rename, a fixture
  // for a club we have no code or alias for). Fall back to the away side,
  // mirroring `opponentFor`, so the link still points at something real.
  const fallback = game.visit?.trim();
  return fallback ? { name: fallback, league: game.league } : null;
}

/**
 * Build the team calendar path — `/t/<competition>/<code>/<league>/<squad>`.
 *
 * Split out from `buildTeamCalendarUrl` so the short-link store can derive the
 * very same path from its stored parameters without an origin. There is one
 * definition of the path shape; the URL builder only prepends the origin.
 *
 * The league segment is what keeps a squad unambiguous: the same team name
 * exists in several leagues, and only the pair identifies one team. A squad
 * with no known league (a hand-typed one, or a legacy link) falls back to the
 * old three-segment shape `/t/<competition>/<code>/<squad>`, which the public
 * route still understands.
 *
 * Returns null when the squad cannot be determined, so the caller omits the
 * line rather than emitting a broken link.
 */
export function buildTeamCalendarPath(
  club: { competition: CompetitionId; code: number },
  squad: Squad | null,
): string | null {
  if (!squad) return null;
  const segments = [
    club.competition,
    String(club.code),
    ...(squad.league ? [squad.league] : []),
    squad.name,
  ].map((s) => encodeURIComponent(s));
  return `${TEAM_CALENDAR_PATH_PREFIX}/${segments.join('/')}`;
}

/**
 * Build the team calendar URL that goes into the WhatsApp message.
 *
 * Returns null when the squad cannot be determined, so the caller omits the
 * line rather than emitting a broken link.
 *
 * There is no readiness gate here, unlike `buildCalendarUrl`: the squad name
 * is readable off any fixture, ready or pending, so a match with no confirmed
 * kickoff time still gets a link (the linked page shows it as
 * "hora por confirmar").
 */
export function buildTeamCalendarUrl(
  club: { competition: CompetitionId; code: number },
  squad: Squad | null,
  baseUrl: string,
): string | null {
  const path = buildTeamCalendarPath(club, squad);
  if (!path) return null;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Build the single-match landing-page path —
 * `/c/<when>/<title>/<location>`.
 *
 * Split out from `buildCalendarUrl` for the same reason as
 * `buildTeamCalendarPath`: the short-link store derives the canonical target
 * from stored parameters (date, time, title, venue) and must produce the very
 * same path the calendar link produces.
 */
export function buildCalendarPath(event: MatchEvent): string {
  const segments = [
    `${event.date ?? ''}-${event.time ?? ''}`,
    event.title,
    event.location,
  ].map((s) => encodeURIComponent(s));

  return `${CALENDAR_PATH_PREFIX}/${segments.join('/')}`;
}

/**
 * Build the single-match landing-page URL that goes into the WhatsApp message.
 * Returns null for a not-ready match so the caller omits the line.
 *
 * This is the one-tap "add THIS match" action. It coexists with
 * `buildTeamCalendarUrl` below — the message carries both links: this one for
 * the match being convoked, the other for the squad's full schedule.
 */
export function buildCalendarUrl(
  game: Game,
  club: ClubType,
  baseUrl: string,
): string | null {
  if (!isMatchReady(game)) return null;

  const opponent = opponentFor(game, club);
  const title = opponent
    ? `Game with ${opponent}`
    : `${game.local ?? ''} - ${game.visit ?? ''}`.trim();

  const path = buildCalendarPath({
    title,
    date: game.date ?? '',
    time: game.time ?? '',
    location: locationText(game),
  });

  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Percent-decode as many layers as are present, stopping as soon as the value
 * stops changing.
 *
 * How many layers a catch-all param arrives with is NOT ours to control:
 * Next.js decodes `params.path` once, but a link that has been through
 * WhatsApp (or any other client that re-encodes `%` as `%25`) arrives with an
 * extra layer, and a future runtime/edge change can alter it again. Decoding
 * once and assuming the result is clean is what made this page start 400ing
 * with a perfectly good link.
 *
 * A malformed escape (`100% CP`, a bare `%`) throws; that is not an error
 * here, it just means the value is not percent-encoded at this layer. Keep
 * what we have and stop rather than failing the whole request.
 *
 * Exported for the `/t` team calendar route, whose squad path segment travels
 * over the same WhatsApp relay and takes the same damage. It is used there
 * together with whitespace normalisation, because a mangled relay can turn an
 * encoded space into `+` or a doubled space — see `normalizeSquadSegment` in
 * that route.
 */
export function decodeFully(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(out);
    } catch {
      break;
    }
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Parse the `<when>/<title>/<location>` path segments produced by
 * `buildCalendarUrl`. Returns null when the shape is wrong or the kickoff is
 * not ready.
 *
 * Two things about the incoming path are not ours to control, and both used to
 * turn a perfectly good link into "no se pudo abrir el partido":
 *
 * 1. How many times it has been percent-decoded. Next.js decodes
 *    `params.path` once; a link relayed through WhatsApp can carry an extra
 *    layer. `decodeFully` above removes whatever is there.
 * 2. Whether `%2F` is treated as a separator. Normally the kickoff arrives as
 *    one segment (`24/10/2026-17:00`), but a runtime that decodes before
 *    splitting hands us `24`, `10`, `2026-17:00` as three — which shifts every
 *    later segment along, so the "title" is read as `2026-17:00` and the parse
 *    dies. We therefore try joining leading segments, but only accept a join
 *    that is *exactly* a kickoff (see `KICKOFF_RE`), so a valid-looking join
 *    can never swallow the title or let `00:00` masquerade as a real time.
 */
const KICKOFF_RE = /^\d{1,2}\/\d{1,2}\/\d{4}-\d{1,2}:\d{2}$/;

export function parseEventPath(segments: string[]): MatchEvent | null {
  const parts = segments.filter((s) => s.length > 0).map(decodeFully);

  // Need at least the when-segment and a title; the venue may legitimately be
  // absent, so do not require a third segment up front.
  if (parts.length < 2) return null;

  // `consumed` = how many leading segments make up the kickoff. Normally 1;
  // more only if the runtime split the date on its encoded slashes.
  //
  // The loop below runs `consumed` from 1 upwards and returns on the first
  // match, so the *simplest* reading always wins: a title that happens to look
  // like a date fragment can never steal a segment from the real kickoff. A
  // genuinely split date has no valid single-segment reading, so it falls
  // through to the 2- and 3-segment joins.
  for (let consumed = 1; consumed <= parts.length - 1; consumed++) {
    const whenRaw = parts.slice(0, consumed).join('/');
    if (!KICKOFF_RE.test(whenRaw)) continue;

    const hyphenIdx = whenRaw.indexOf('-');
    const date = whenRaw.slice(0, hyphenIdx);
    const time = whenRaw.slice(hyphenIdx + 1);
    // Exact-shape match is not enough on its own: `00:00` and `--:--` are
    // sidgad's "time not published" sentinels and must stay rejected.
    if (!parseKickoff(date, time)) continue;

    const rest = parts.slice(consumed);
    const title = rest[0];
    if (!title) return null;

    // A venue containing "https://goo.gl/..." can also arrive split on its
    // slashes. Rejoin it so `splitVenue` sees "Name (url)" whole again;
    // `https:/` loses a slash that was eaten as a separator.
    const location = rest
      .slice(1)
      .join('/')
      .replace(/https:\/(?!\/)/g, 'https://');

    return { title, date, time, location };
  }

  return null;
}

/**
 * Validate `date` is dd/mm/yyyy and `time` is hh:mm and not a sentinel.
 * Returns the wall-clock components on success, null on failure.
 *
 * Uses `parseSidgadDate` for shape validation but deliberately reads the
 * components out of its UTC slots — that helper stores Madrid wall-clock
 * numbers there by design.
 */
export function parseKickoff(
  date: string | null,
  time: string | null,
): KickoffParts | null {
  if (!date) return null;
  if (!time) return null;
  const trimmed = time.trim();
  if (!trimmed || TIME_SENTINELS.some((re) => re.test(trimmed))) return null;
  if (!/\d/.test(trimmed)) return null;

  const d = parseSidgadDate(date, time);
  if (!d) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Spanish human-readable date + time, e.g. "sábado, 24 de octubre, 17:00". */
export function formatSpanishKickoff(date: string, time: string): string {
  const parts = parseKickoff(date, time);
  if (!parts) return `${date} ${time}`;
  // Date.UTC gives us a stable base for toLocaleDateString with
  // timeZone 'UTC' — the wall-clock components live in the UTC slots, so
  // formatting with 'UTC' reads them back verbatim.
  const d = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  const formatted = d.toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${formatted}, ${time}`;
}

/**
 * Build a Google Calendar "add event" URL.
 *
 * Shape is pinned to a link confirmed working by hand:
 *
 *   https://calendar.google.com/calendar/render
 *     ?action=TEMPLATE
 *     &text=<title>
 *     &dates=<start>/<end>      (real UTC instants, Z on BOTH halves)
 *     &ctz=Europe/Madrid
 *     &details=<fixed note>
 *     &location=<venue, optional>
 *
 * Notes on the parts that look redundant:
 *
 * - `/calendar/render` (no `r/`). Google's docs also advertise
 *   `/calendar/r/eventedit`, but the Google Calendar **Android app**
 *   registers no App Link handler for `eventedit` and drops the query
 *   string — the Calendar app opens on the day view with nothing to save.
 *   `/calendar/render` is the form that reaches the editor on Android.
 * - `dates` uses real UTC instants with `Z` on both halves, NOT the Madrid
 *   wall clock. Passing wall-clock digits alongside `ctz` makes the editor
 *   open empty.
 * - `ctz=Europe/Madrid` is kept even though `dates` is UTC. It does not
 *   shift the instant (the `Z` already fixes it) — it tells Google which
 *   zone the event conceptually belongs to, which is what makes a Spanish
 *   fixture display at the intended hour.
 *
 * Do not "simplify" this: every one of these details was arrived at by
 * breaking it on a real device.
 */
export function buildGoogleCalendarUrl(event: MatchEvent): string | null {
  const kickoff = madridKickoffAsUtc(event.date, event.time);
  if (!kickoff) return null;
  const end = new Date(kickoff.getTime() + MATCH_DURATION_MINUTES * 60 * 1000);

  const params: Record<string, string> = {
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatUtcStamp(kickoff)}/${formatUtcStamp(end)}`,
    ctz: MADRID_TZ_ID,
    details: 'Convocatoria enviada por WhatsApp',
  };
  if (event.location) params.location = event.location;

  const search = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return `https://calendar.google.com/calendar/render?${search}`;
}

/** `YYYYMMDDTHHMMSSZ` from a real-UTC Date. Both halves of `dates` need it. */
function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Real UTC `Date` for a kickoff expressed in Europe/Madrid wall-clock terms
 * (sidgad format: `date` = "dd/mm/yyyy", `time` = "hh:mm"). Returns `null` on
 * malformed input — same nullability contract as `parseSidgadDate`.
 *
 * Unlike `parseSidgadDate`, this does NOT use the "UTC slots hold Madrid
 * components" trick. The returned Date is a real UTC instant, so
 * `toISOString()` emits a correct absolute moment. `parseSidgadDate`'s
 * output MUST NOT be used here: its UTC slots hold Madrid numbers, so
 * `toISOString()` would emit the wall clock as if it were UTC and land the
 * event one or two hours off depending on the season.
 *
 * DST-safe: 18:30 Madrid on 15/02 (CET, UTC+1) and on 18/10 (CEST, UTC+2)
 * resolve to different real instants, which is what an absolute-time
 * consumer needs.
 */
function madridKickoffAsUtc(date: string, time: string): Date | null {
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return null;
  const [hh = '00', mm = '00'] = time.split(':');
  const y = Number.parseInt(year, 10);
  const mo = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  const h = Number.parseInt(hh, 10);
  const mi = Number.parseInt(mm, 10);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;

  // Treat the components as if they were UTC; that instant is offset from
  // the real kickoff by the Madrid UTC offset in force at that moment.
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));

  // Read back the wall clock `guess` actually shows in Madrid. The gap is
  // the Madrid offset, DST included.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(guess);
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const displayedHour = get('hour') % 24;
  const guessAsMadridWallClock = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    displayedHour,
    get('minute'),
  );
  const offsetMs = guessAsMadridWallClock - guess.getTime();

  return new Date(guess.getTime() - offsetMs);
}