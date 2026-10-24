import type { ClubType, Game } from '@/types';
import type { CompetitionId } from '@/constants/competitions';
import {
  buildCalendarPath,
  buildTeamCalendarPath,
  locationText,
  opponentFor,
} from '@/lib/calendarEvent';
import { nowInMadrid, parseSidgadDate } from '@/lib/matchDate';

// The domain rules for app-owned short links.
//
// A short link is `/link/<hash>`: an opaque, random, revocable name for a
// page the app already serves. The hash says nothing about the target, so a
// link that leaks into a WhatsApp group cannot be guessed at, and the club
// can kill it.
//
// The canonical pages (`/t/...` and `/c/...`) remain the source of truth:
// a short link only *names* one of them, and the target path is derived here
// with the very same builders the calendar links use.

/** Public path prefix for the resolver. */
export const SHORT_LINK_PATH_PREFIX = '/link';

/**
 * Crockford base32: no `I`, `L`, `O` or `U`, so a character can never be
 * misread off a phone screen or retyped in the wrong case. Uppercase only.
 */
export const HASH_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 8 characters × 5 bits = 40 bits of entropy. */
export const HASH_LENGTH = 8;

export type LinkKind = 'team_calendar' | 'match_calendar';

/**
 * The parameters a link's target is described by.
 *
 * These are the values the app derives for itself; the client sends the raw
 * fixture fields and the app turns them into a payload and a target key.
 */
export type LinkPayload = {
  /** team_calendar: the squad the calendar is scoped to. */
  squad?: string;
  /**
   * team_calendar: the league that squad plays in.
   *
   * Part of the squad's identity: the same team name exists in several
   * leagues, and only the pair names one team. Absent for links created
   * before squads carried their league — those keep the legacy
   * name-only scope.
   */
  league?: string;
  /** match_calendar: the fixture's date, as published (`dd/mm/yyyy`). */
  date?: string;
  /** match_calendar: the fixture's kickoff (`hh:mm`). */
  time?: string;
  /** match_calendar: the event title, derived from the opponent. */
  title?: string;
  /** match_calendar: the venue text, map URL included in parentheses. */
  location?: string;
};

/** What the client asks for when creating a link. */
export type LinkRequest =
  | { kind: 'team_calendar'; squad: string; league?: string | null }
  | {
      kind: 'match_calendar';
      date: string;
      time: string;
      local: string;
      visit: string;
      localCode?: number | null;
      visitCode?: number | null;
      location?: string | null;
      map?: string | null;
    };

/**
 * A cryptographically random hash.
 *
 * Random, NOT derived from the target: the target is drawn from a small
 * public catalogue (a club code and a squad name), so a deterministic hash
 * would be enumerable by anyone who knows the catalogue. The hash hides
 * nothing by itself — it hides the fact that there is anything to find.
 */
export function generateHash(): string {
  const alphabet = HASH_ALPHABET;
  const out: string[] = [];
  // getRandomValues rejects a request larger than 65536 bytes; 8 characters
  // needs one byte each at most.
  const bytes = new Uint8Array(HASH_LENGTH);
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is not available in this runtime');
  }
  webCrypto.getRandomValues(bytes);
  for (let i = 0; i < HASH_LENGTH; i++) {
    out.push(alphabet[bytes[i] % alphabet.length]);
  }
  return out.join('');
}

/**
 * Normalise a candidate hash: upper-case it and reject anything that is not
 * in the alphabet.
 *
 * Case-insensitive so a player who retypes the link in lower case still
 * reaches the page.
 */
export function normalizeHash(raw: string): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper.length !== HASH_LENGTH) return null;
  for (const ch of upper) {
    if (!HASH_ALPHABET.includes(ch)) return null;
  }
  return upper;
}

/** The short link's path: `/link/<hash>`. */
export function buildShortLinkPath(hash: string): string {
  return `${SHORT_LINK_PATH_PREFIX}/${hash}`;
}

/**
 * The short link's absolute URL.
 *
 * `baseUrl` follows the same rule as the calendar links: the deployed origin
 * in production, the browser's origin in development. A relative base yields
 * a relative URL, which is what a server-side render wants.
 */
export function buildShortLinkUrl(hash: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}${buildShortLinkPath(hash)}`;
}

/**
 * The target's identity — what makes two requests for "the same thing".
 *
 * The kickoff time is deliberately NOT part of a match's identity: the
 * federation publishes a time and then corrects it, and a link that changed
 * its hash for that would leave the copy already pasted in the WhatsApp
 * group pointing at the old time. The date IS part of it: a reschedule to
 * another day is a different fixture, and the stored kickoff and venue
 * belong to the original day.
 */
export function targetKeyFor(
  club: Pick<ClubType, 'code' | 'competition'>,
  kind: LinkKind,
  request: LinkRequest,
): string {
  if (kind === 'team_calendar') {
    const team = request as Extract<LinkRequest, { kind: 'team_calendar' }>;
    // The league is part of the target: "DOMINICOS A in ALEVÍN GRUPO A" and
    // "DOMINICOS A in SENIOR MASCULINO" are two different teams and must not
    // share a link. A link without a league keeps the legacy key shape, so
    // the links already handed out are reused rather than duplicated.
    const league = team.league?.trim();
    return league
      ? `${club.competition}:${club.code}:${league}:${team.squad}`
      : `${club.competition}:${club.code}:${team.squad}`;
  }
  const match = request as Extract<LinkRequest, { kind: 'match_calendar' }>;
  return `${club.competition}:${club.code}:${match.date}:${match.local}:${match.visit}`;
}

/**
 * The payload the store keeps for a link — everything needed to derive the
 * canonical target later, and nothing more.
 *
 * The title is derived here, from the fixture, rather than accepted from the
 * client: the title is the one piece of the payload a reader sees, and it
 * must name the opponent and not the club's own team.
 */
export function payloadFor(
  club: ClubType,
  kind: LinkKind,
  request: LinkRequest,
): LinkPayload {
  if (kind === 'team_calendar') {
    const team = request as Extract<LinkRequest, { kind: 'team_calendar' }>;
    const league = team.league?.trim();
    return league
      ? { squad: team.squad, league }
      : { squad: team.squad };
  }

  const match = request as Extract<LinkRequest, { kind: 'match_calendar' }>;
  const game: Game = {
    league: null,
    date: match.date,
    time: match.time,
    local: match.local,
    visit: match.visit,
    location: match.location ?? null,
    map: match.map ?? null,
    localCode: match.localCode ?? null,
    visitCode: match.visitCode ?? null,
    gameId: null,
  };

  const opponent = opponentFor(game, club);
  const title = opponent
    ? `Game with ${opponent}`
    : `${game.local ?? ''} - ${game.visit ?? ''}`.trim();

  return {
    date: match.date,
    time: match.time,
    title,
    location: locationText(game),
  };
}

/**
 * The canonical path a link resolves to.
 *
 * Derived with the same builders the calendar links use, so a short link and
 * the canonical URL always describe the same page.
 */
export function canonicalPathFor(
  club: Pick<ClubType, 'code' | 'competition'>,
  kind: LinkKind,
  payload: LinkPayload,
): string | null {
  if (kind === 'team_calendar') {
    const league = payload.league?.trim();
    return buildTeamCalendarPath(
      club,
      league
        ? { name: payload.squad ?? '', league }
        : { name: payload.squad ?? '', league: null },
    );
  }

  if (!payload.date || !payload.time || !payload.title) return null;

  return buildCalendarPath({
    title: payload.title,
    date: payload.date,
    time: payload.time,
    location: payload.location ?? '',
  });
}

/**
 * A human-readable description of what a link points at, for the management
 * page and the API's list.
 */
export function describeLink(kind: LinkKind, payload: LinkPayload): string {
  if (kind === 'team_calendar') {
    const squad = payload.squad ?? '';
    const league = payload.league?.trim();
    // The league is spelled out so the club can tell two same-named teams
    // apart in the link list.
    const scope = league ? `${squad} — ${league}` : squad;
    return `Calendario del equipo · ${scope}`.trim();
  }
  const when = [payload.date, payload.time].filter(Boolean).join(' ');
  return `Partido · ${when} · ${payload.title ?? ''}`.trim();
}

/**
 * The calendar day a date falls on, as a number two days can be compared by.
 *
 * `parseSidgadDate` and `nowInMadrid` both encode the Europe/Madrid
 * wall-clock components in the Date's UTC slots, so the UTC fields of the
 * result ARE the Madrid year/month/day. Dropping the time and rebuilding the
 * date in UTC gives a key that orders days the way a calendar does, and that
 * ignores both the hour of the day and any DST shift.
 */
function dayKey(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The day a `dd/mm/yyyy` date falls on, or null when it cannot be read.
 *
 * `parseSidgadDate` trusts the numbers it is handed: '10/24/2026' reads as
 * the 24th month of 2026 and rolls over into the next year, and '31/02/2026'
 * reads as the 3rd of March. The parts are therefore checked against what
 * the parsed Date actually holds, so a day key always points at the day the
 * string names — and a string that names no real day yields no key at all.
 */
export function matchDayKey(date?: string | null): number | null {
  const parsed = parseSidgadDate(date ?? null, null);
  if (!parsed) return null;

  const [rawDay, rawMonth, rawYear] = (date ?? '').split('/');
  if (
    Number.parseInt(rawDay ?? '', 10) !== parsed.getUTCDate() ||
    Number.parseInt(rawMonth ?? '', 10) !== parsed.getUTCMonth() + 1 ||
    Number.parseInt(rawYear ?? '', 10) !== parsed.getUTCFullYear()
  ) {
    return null;
  }

  return dayKey(parsed);
}

/** Today in Madrid, as a day key — the other half of `matchDayKey`. */
export function todayDayKey(now: Date = nowInMadrid()): number {
  return dayKey(now);
}

/**
 * Is this link past the last day it could still be useful?
 *
 * A match link is good for the WHOLE of its fixture's day — before the
 * kickoff and after it — and stops working once that day is over. The
 * comparison is therefore day-granular: a link to a match played at 21:00 is
 * still shareable at 23:00, and a link to a match played today is dead
 * tomorrow.
 *
 * A team-calendar link never expires. It names a squad rather than a
 * fixture, so there is no date for it to expire on.
 *
 * A match link whose date cannot be read counts as expired: "not provably
 * still current" must not read as "still current".
 */
export function isLinkExpired(
  kind: LinkKind,
  payload: LinkPayload,
  now: Date = nowInMadrid(),
): boolean {
  if (kind !== 'match_calendar') return false;

  const matchDay = matchDayKey(payload.date);
  if (matchDay === null) return true;

  return matchDay < dayKey(now);
}

/**
 * A link as the UI and the API see it.
 *
 * Deliberately a flat, serialisable shape: the same view is produced by the
 * management API and by the server-rendered page, so the two can never
 * disagree about what a link looks like.
 */
export type LinkView = {
  hash: string;
  path: string;
  url: string;
  kind: LinkKind;
  description: string;
  target: string | null;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  /** The fixture's day is over: the link can no longer be opened. */
  expired: boolean;
};

/** The shape a stored link must have to be viewed. */
export type LinkRecord = {
  hash: string;
  clubCode: number;
  competition: CompetitionId;
  kind: LinkKind;
  payload: LinkPayload;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};

/** Turn a stored link into the view the UI and the API hand out. */
export function linkView(link: LinkRecord, baseUrl: string): LinkView {
  return {
    hash: link.hash,
    path: buildShortLinkPath(link.hash),
    url: buildShortLinkUrl(link.hash, baseUrl),
    kind: link.kind,
    description: describeLink(link.kind, link.payload),
    target: canonicalPathFor(
      { code: link.clubCode, competition: link.competition },
      link.kind,
      link.payload,
    ),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    active: link.disabledAt === null,
    expired: isLinkExpired(link.kind, link.payload),
  };
}
