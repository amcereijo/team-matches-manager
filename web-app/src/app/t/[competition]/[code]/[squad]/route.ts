import {
  buildGoogleCalendarUrl,
  decodeFully,
  isMatchReady,
  opponentFor,
} from '@/lib/calendarEvent';
import { COMPETITIONS, type CompetitionId } from '@/constants/competitions';
import { CLUBS_MAP, clubMapKey } from '@/constants/clubs';
import { clubAliases, isClubMatch, normalizeClubName } from '@/lib/clubTeams';
import { escapeHtml } from '@/lib/html';
import { isDateProvisional, nowInMadrid, parseSidgadDate } from '@/lib/matchDate';
import { fetchFgpMatches } from '@/services/fgp';
import { fetchFmpMatches } from '@/services/fmp';
import type { ClubType, Game } from '@/types';

// Public team calendar page — no iron-session, no auth, no cookies set.
//
// The URL is shared via WhatsApp to players who are NOT club admins and have
// no account here, so everything the page needs arrives in the path.
//
// IMPORTANT: this route MUST NOT log IPs, user agents, or any other
// identifying information about the requester. Recipients' privacy depends on
// this. It is also read-only: it must not mutate any server-side state.
//
// Unlike its sibling `/c/[...]`, this page is NOT a pure function of its URL.
// `/c` carries the match data in the address, so it can render with zero I/O
// and cannot fail. A squad's fixture *list* cannot be carried in a path, so
// this page points at live upstream data instead. That brings caching,
// latency, staleness and an error branch that `/c` does not have — see
// design.md D1 and D5.

const COMPETITION_IDS: CompetitionId[] = ['FMP', 'FGP'];

// Browser cache / CDN cache / serve-stale-while-revalidating, all in seconds.
// `max-age` covers the recipient's own phone (re-tapping the link they were
// sent this morning renders from their browser cache, no round trip);
// `s-maxage` covers every other player tapping the same link via the Vercel
// edge; `stale-while-revalidate` means users are served *something* while a
// fresh copy is fetched, never a spinner followed by an error.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=21600';

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

// ---------------------------------------------------------------------------
// Federation-scoped fixture cache
// ---------------------------------------------------------------------------
//
// `fetchFgpMatches` / `fetchFmpMatches` return EVERY fixture in the
// federation — only the per-club filter differs between pages. Caching the
// unfiltered result means one scrape serves all clubs in that competition.
//
// On Vercel serverless this cache will often cold-start alongside the lambda,
// so it is a bonus rather than the main lever; the CDN header above is the
// lever that actually holds. In local dev and on long-lived instances it
// removes the scrape from every request entirely.

type FederationCacheEntry = {
  at: number;
  matches: Game[];
};

// Kept in hours to match `s-maxage`, so the process cache never serves
// something older than the edge would have.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const federationCache = new Map<CompetitionId, FederationCacheEntry>();

async function fetchCompetitionMatches(
  competition: CompetitionId,
): Promise<Game[]> {
  const cached = federationCache.get(competition);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.matches;

  const { matches } =
    competition === 'FGP' ? await fetchFgpMatches() : await fetchFmpMatches();

  federationCache.set(competition, { at: Date.now(), matches });
  return matches;
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

/**
 * Repair a segment that has been through a relay that mangles whitespace.
 *
 * A link that passed through WhatsApp can come back with its encoded spaces
 * turned into `+`, or doubled. Neither `decodeFully` nor the path splitter
 * undoes that, so a squad named `HL NOROESTE A` would arrive as
 * `HL+NOROESTE+A` or `HL  NOROESTE  A` and match nothing.
 *
 * Runs *after* `decodeFully` and only collapses whitespace — it never
 * re-encodes, so a literal `+` inside a real squad name would be lost. No
 * club or squad in either federation's catalogue contains one, and treating
 * `+` as a space is the overwhelmingly more likely relay artefact.
 */
function normalizeSegment(value: string): string {
  return value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeSegment(value: string): string {
  return normalizeSegment(decodeFully(value));
}

// ---------------------------------------------------------------------------
// Fixture selection
// ---------------------------------------------------------------------------

type UpcomingFixture = {
  game: Game;
  kickoff: Date | null;
};

// TEMPORAL_WARNING_DAYS / isDateProvisional live in lib/matchDate.ts: they are
// pure date arithmetic on the Madrid-encoded kickoffs, and living in `lib`
// keeps them testable — no live fixture is currently inside the 15-day window,
// so the "settled date" branch has no live coverage at all.

function isCompetitionId(value: string): value is CompetitionId {
  return (COMPETITION_IDS as string[]).includes(value);
}

/**
 * The squad's upcoming fixtures, chronological, pending ones included.
 *
 * Club membership MUST use the same two-pronged rule as `getMatchesForClub`:
 * the upstream `param_game` codes AND the name aliases. Name matching alone is
 * not enough — the federation's squad names do not reliably derive from the
 * catalogue's club names (`ALAMEDA DE OSUNA A` is club 386's `ALAMEDA OSUNA
 * HP`), so a name-only filter silently returns an empty calendar for exactly
 * the clubs whose names diverged most.
 *
 * Squad scoping, by contrast, MUST be an EXACT normalised name comparison —
 * not `isClubMatch`. `clubAliases` strips a trailing ` A`/` B` to build a stem
 * so a club base name matches its suffixed squads, which is right for club
 * membership but catastrophic here: `clubAliases('ALAMEDA DE OSUNA A')` also
 * yields the stem `ALAMEDA DE OSUNA`, and `isClubMatch`'s `startsWith` rule
 * then pulls in every sibling squad (`ALAMEDA DE OSUNA B`, …). A player
 * convoked for squad A would see squad B's fixtures.
 *
 * Exact comparison is safe because `squadFor` writes the squad name into the
 * URL verbatim from the fixture, so a generated link always matches itself.
 * `normalizeClubName` still absorbs case and whitespace differences in a
 * hand-edited link.
 *
 * A null `squad` means club-wide (no squad segment in the path).
 *
 * `kickoff` is null for a fixture whose date could not be parsed at all; those
 * sort last so a dated fixture is always featured first.
 */
function selectSquadFixtures(
  matches: Game[],
  club: ClubType,
  squad: string | null,
): UpcomingFixture[] {
  const aliases = clubAliases(club.name);
  const squadNorm = squad ? normalizeClubName(squad) : null;
  const now = nowInMadrid().getTime();

  const selected: UpcomingFixture[] = [];
  for (const game of matches) {
    const isOurs =
      game.localCode === club.code ||
      game.visitCode === club.code ||
      isClubMatch(game.local, aliases) ||
      isClubMatch(game.visit, aliases);
    if (!isOurs) continue;

    if (squadNorm) {
      const isSquad =
        (game.local !== null && normalizeClubName(game.local) === squadNorm) ||
        (game.visit !== null && normalizeClubName(game.visit) === squadNorm);
      if (!isSquad) continue;
    }

    const kickoff = parseSidgadDate(game.date, game.time);
    // Same rule as `getMatchesForClub`: drop played fixtures, but KEEP ones
    // with no parseable kickoff. Sidgad's "time not published yet" sentinels
    // parse to midnight, which reads as past and would silently drop a
    // pending fixture the player most needs to see.
    if (isMatchReady(game) && kickoff && kickoff.getTime() < now) continue;

    selected.push({ game, kickoff });
  }

  selected.sort((a, b) => {
    if (a.kickoff && b.kickoff) return a.kickoff.getTime() - b.kickoff.getTime();
    if (a.kickoff) return -1;
    if (b.kickoff) return 1;
    return 0;
  });

  return selected;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function formatDayLabel(date: string | null): string {
  const d = parseSidgadDate(date, null);
  if (!d) return '';
  // parseSidgadDate stores Madrid wall-clock components in the Date's UTC
  // slots, so formatting with timeZone 'UTC' reads them back verbatim
  // regardless of where this runs (Vercel is UTC, a dev Mac is Madrid).
  return d
    .toLocaleDateString('es-ES', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    })
    .replace('.', '');
}

function formatGeneratedAt(now: Date): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  // Same quirk `nowInMadrid` guards against: a 24-hour formatter can emit
  // hour '24' for midnight in some ICU versions, which would render the
  // freshness line as "24:00".
  const hour = Number.parseInt(get('hour'), 10) % 24;
  return `${String(hour).padStart(2, '0')}:${get('minute')}`;
}

// `opponentFor` is imported rather than reimplemented: an earlier private copy
// here decided "which side is ours" from name aliases alone, which the live
// data shows is wrong for clubs whose squad names diverge from the catalogue
// name (it produced titles like "Game with ALAMEDA DE OSUNA A" — the user's
// own team — for away fixtures).
function buildCalendarHref(game: Game, club: ClubType): string | null {
  if (!game.date || !isMatchReady(game)) return null;
  const opponent = opponentFor(game, club);
  return buildGoogleCalendarUrl({
    title: opponent
      ? `Game with ${opponent}`
      : `${game.local ?? ''} - ${game.visit ?? ''}`.trim(),
    date: game.date,
    time: game.time ?? '',
    // The map URL goes into `location` so it lands in the calendar entry as
    // written by the existing `/c` route's venue text.
    location: game.location
      ? game.map
        ? `${game.location} (${game.map})`
        : game.location
      : '',
  });
}

function renderFixtureRow(
  entry: UpcomingFixture,
  club: ClubType,
  featured: boolean,
  nowMs: number,
): string {
  const { game } = entry;
  const ready = isMatchReady(game);
  const teams = `${game.local ?? '?'} <span class="vs">vs</span> ${game.visit ?? '?'}`;

  const day = formatDayLabel(game.date);
  const timeCell = ready
    ? `<span class="fact"><span aria-hidden>⏰</span> ${escapeHtml(game.time ?? '')}</span>`
    : `<span class="fact pending"><span aria-hidden>⏳</span> hora por confirmar</span>`;

  const venueCell = game.location
    ? `<span class="fact"><span aria-hidden>📍</span> ${escapeHtml(game.location)}${
        game.map
          ? ` · <a class="map" href="${escapeHtml(game.map)}" target="_blank" rel="noopener noreferrer">Cómo llegar</a>`
          : ''
      }</span>`
    : '';

  const calendarHref = buildCalendarHref(game, club);
  const calendarCell = calendarHref
    ? `<a class="icon add" href="${escapeHtml(calendarHref)}" target="_blank" rel="noopener noreferrer" aria-label="Añadir ${escapeHtml(
        game.local ?? '',
      )} contra ${escapeHtml(game.visit ?? '')} al calendario"><span aria-hidden>📆</span><span class="iconLabel">Añadir a calendario</span></a>`
    : '';

  // Whether the DATE is provisional depends only on how far out the fixture is
  // — never on whether its kickoff time has been published. The federation
  // reschedules a fixture up until TEMPORAL_WARNING_DAYS before it is played,
  // and that is true whether or not a time has been confirmed: a fixture with a
  // published time can still be moved to a different day.
  //
  // The "hora por confirmar" indicator above is the orthogonal concern — it
  // reports that the TIME is missing. A far-off fixture can carry both; a
  // near-in one carries neither.
  const temporalNote = isDateProvisional(entry.kickoff, nowMs)
    ? `<p class="temporal"><span aria-hidden>ⓘ</span> <strong>Fecha temporal:</strong> puede cambiar hasta 15 días antes del fin de semana del partido.</p>`
    : '';

  return `<article class="fixture${featured ? ' featured' : ''}">
      <p class="when">${day ? `<span aria-hidden>🗓</span> ${escapeHtml(day)}` : ''}</p>
      <h3 class="teams">${teams}</h3>
      <div class="facts">${timeCell}${venueCell}</div>
      ${temporalNote}
      ${calendarCell ? `<div class="actions">${calendarCell}</div>` : ''}
    </article>`;
}

function buildPageHtml(args: {
  club: ClubType;
  competitionName: string;
  squad: string;
  fixtures: UpcomingFixture[];
  generatedAt: Date;
}): string {
  const { club, competitionName, squad, fixtures, generatedAt } = args;
  const count = fixtures.length;
  const [first, ...rest] = fixtures;
  // Same Madrid-encoded "now" the selector used, so the temporal window is
  // measured in the same clock as every kickoff on the page.
  const nowMs = nowInMadrid().getTime();

  const restRows = rest
    .map((entry, i) => {
      // `i === 0` compares against the featured fixture, so the separator
      // logic is identical for every row — no special case needed.
      const prev = i === 0 ? first : rest[i - 1];
      const showSeparator =
        !prev?.kickoff || !entry.kickoff || isoWeekKey(prev.kickoff) !== isoWeekKey(entry.kickoff);
      return `${showSeparator ? '<div class="sep" aria-hidden></div>' : ''}${renderFixtureRow(
        entry,
        club,
        false,
        nowMs,
      )}`;
    })
    .join('');

  const body = count
    ? `${renderFixtureRow(first, club, true, nowMs)}${restRows}`
    : `<div class="empty">
         <p class="emptyTitle">No hay partidos programados por ahora</p>
         <p class="emptyHint">Cuando la federación publique nuevas fechas aparecerán aquí.</p>
       </div>`;

  const countLabel = `${count} ${count === 1 ? 'partido' : 'partidos'}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(squad)} — Partidos</title>
<style>
:root{--bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#475569;--subtle:#64748b;--accent:#2563eb;--accent-hover:#1d4ed8;--temporal-bg:#fffbeb;--temporal-border:#fde68a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{max-width:560px;margin:0 auto;padding:20px 16px calc(32px + env(safe-area-inset-bottom))}
.head{margin-bottom:18px}
.eyebrow{margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle)}
.title{margin:0;font-size:22px;line-height:1.25;font-weight:700}
.meta{margin:6px 0 0;font-size:14px;color:var(--muted)}
.fresh{margin:4px 0 0;font-size:12px;color:var(--subtle)}
.list{display:flex;flex-direction:column;gap:10px}
.fixture{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.fixture.featured{border-color:var(--accent);box-shadow:0 1px 3px rgba(15,23,42,.06)}
.when{margin:0 0 4px;font-size:13px;font-weight:600;color:var(--muted);text-transform:capitalize}
.teams{margin:0 0 8px;font-size:17px;line-height:1.3;font-weight:700}
.teams .vs{color:var(--subtle);font-weight:400;font-size:14px}
.facts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;color:var(--muted)}
.fact.pending{color:var(--subtle)}
.temporal{margin:10px 0 0;padding:9px 11px;font-size:13px;line-height:1.45;color:var(--muted);background:var(--temporal-bg);border:1px solid var(--temporal-border);border-radius:8px}
a.map{color:var(--accent)}
.actions{margin-top:12px}
.icon{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;font-size:15px;font-weight:600;color:#fff;background:var(--accent);border-radius:10px;text-decoration:none}
.icon:hover{background:var(--accent-hover)}
.sep{height:1px;background:var(--border);margin:4px 2px}
.empty{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px 20px;text-align:center}
.emptyTitle{margin:0 0 6px;font-size:16px;font-weight:600}
.emptyHint{margin:0;font-size:14px;color:var(--muted)}
.foot{margin:24px 0 0;font-size:12px;line-height:1.5;color:var(--subtle);text-align:center}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#cbd5e1;--subtle:#94a3b8;--accent:#3b82f6;--accent-hover:#2563eb;--temporal-bg:#422006;--temporal-border:#78350f}}
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <p class="eyebrow">${escapeHtml(competitionName)}</p>
    <h1 class="title">${escapeHtml(squad)}</h1>
    <p class="meta">${escapeHtml(club.name)} · ${countLabel}</p>
    <p class="fresh">Datos actualizados a las ${escapeHtml(formatGeneratedAt(generatedAt))}</p>
  </header>
  <div class="list">${body}</div>
  <p class="foot">Pulsa «Añadir a calendario» para guardar el partido en tu calendario.</p>
</main>
</body>
</html>`;
}

function plainPageHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#475569}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 24px;text-align:center}
h1{margin:0 0 10px;font-size:20px;line-height:1.3}
p{margin:0;font-size:15px;line-height:1.55;color:var(--muted)}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#cbd5e1}}
</style>
</head>
<body><main class="page"><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></main></body>
</html>`;
}

const NOT_VALID_HTML = plainPageHtml(
  'Enlace no válido',
  'Esta dirección no corresponde a ningún equipo. Comprueba el enlace que recibiste.',
);

const UPSTREAM_ERROR_HTML = plainPageHtml(
  'No se pudo cargar el calendario',
  'No hemos podido consultar las fechas de la federación. Inténtalo de nuevo en unos minutos.',
);

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  ctx: { params: { competition: string; code: string; squad: string } },
): Promise<Response> {
  const { competition: rawCompetition, code: rawCode, squad: rawSquad } = ctx.params;

  // Identity comes from the path and nowhere else — never from a session,
  // cookie, query string or request body.
  const competition = decodeSegment(rawCompetition);
  const codeRaw = decodeSegment(rawCode);
  const squad = decodeSegment(rawSquad);

  if (!isCompetitionId(competition)) {
    return new Response(NOT_VALID_HTML, { status: 404, headers: { ...HTML_HEADERS, 'Cache-Control': 'public, max-age=300' } });
  }

  const code = Number.parseInt(codeRaw, 10);
  if (!Number.isFinite(code)) {
    return new Response(NOT_VALID_HTML, { status: 404, headers: { ...HTML_HEADERS, 'Cache-Control': 'public, max-age=300' } });
  }

  const club = CLUBS_MAP[clubMapKey(competition, code)];
  if (!club) {
    return new Response(NOT_VALID_HTML, { status: 404, headers: { ...HTML_HEADERS, 'Cache-Control': 'public, max-age=300' } });
  }

  // An empty squad segment resolves to a club-wide calendar rather than a
  // 404: identity is valid, only the scope was omitted. Reaching this needs a
  // hand-crafted URL, since the builder always emits the segment.
  const scope = squad || null;

  let fixtures: UpcomingFixture[];
  try {
    const matches = await fetchCompetitionMatches(competition);
    fixtures = selectSquadFixtures(matches, club, scope);
  } catch (err) {
    // Log the failure for the operator, but log the error object only — never
    // the request, the IP, or the user agent.
    console.error('[team-calendar] fixture fetch failed', err);
    return new Response(UPSTREAM_ERROR_HTML, {
      status: 502,
      headers: { ...HTML_HEADERS, 'Cache-Control': 'no-store' },
    });
  }

  const html = buildPageHtml({
    club,
    competitionName: COMPETITIONS[competition].name,
    squad: scope ?? club.name,
    fixtures,
    generatedAt: new Date(),
  });

  return new Response(html, {
    status: 200,
    headers: { ...HTML_HEADERS, 'Cache-Control': CACHE_CONTROL },
  });
}