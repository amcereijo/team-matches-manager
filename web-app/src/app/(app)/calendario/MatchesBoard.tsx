'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { CompetitionId } from '@/constants/competitions';
import type { ClubType, Game, Squad } from '@/types';
import { buildCalendarUrl, buildTeamCalendarUrl } from '@/lib/calendarUrl';
import { squadFor } from '@/lib/calendarEvent';
import {
  ambiguousSquadNames,
  squadsForMatches,
  squadKey,
  squadLabel,
} from '@/lib/clubTeams';
import { deriveMatchKey } from '@/lib/matchKey';
import { nowInMadrid, parseSidgadDate } from '@/lib/matchDate';
import { getItem, setItem } from '@/services/storage';
import styles from './calendario.module.css';

const INFO_DISMISS_KEY = 'calendario.infoDismissed';
const TEAM_FILTER_KEY = 'calendario.teamFilter';

const UNDATED_KEY = 'undated';

// All Date accessors below read UTC fields. parseSidgadDate encodes Europe/
// Madrid wall-clock components in the UTC slots of the Date it returns, so
// using getUTC* (rather than get* / toLocaleDateString without timeZone)
// makes the Calendario rendering independent of the host's local timezone.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function matchWeekKey(row: Game): string {
  const d = parseSidgadDate(row.date, row.time);
  return d ? isoWeekKey(d) : UNDATED_KEY;
}

function isMatchToday(row: Game, today: Date): boolean {
  const d = parseSidgadDate(row.date, row.time);
  if (!d) return false;
  return (
    d.getUTCFullYear() === today.getUTCFullYear() &&
    d.getUTCMonth() === today.getUTCMonth() &&
    d.getUTCDate() === today.getUTCDate()
  );
}

function formatMatchDate(date?: string | null, time?: string | null): string {
  const d = parseSidgadDate(date, time);
  if (!d) return '';
  // parseSidgadDate encodes Europe/Madrid wall-clock components in the Date's
  // UTC slots. Formatting with timeZone 'UTC' reads from those slots without
  // touching the host's local timezone, so the output matches Madrid time
  // regardless of where this code runs (Vercel UTC, dev Mac Madrid, etc.).
  return d.toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    day: '2-digit',
  });
}

function formatDayLabel(date?: string | null): string {
  const d = parseSidgadDate(date, null);
  if (!d) return '';
  return d
    .toLocaleDateString('es-ES', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    })
    .replace('.', '');
}

function formatSentDate(sentAt: string): string {
  const d = new Date(sentAt);
  if (isNaN(d.getTime())) return sentAt;
  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

// Web-app origin used to build absolute URLs for the calendar link.
//
// In production we read `NEXT_PUBLIC_WEB_APP_URL` (set at build time so the
// value is baked into the bundle). This is the deployed origin — e.g.
// `https://team-matches-manager.vercel.app` — so the WhatsApp link the
// recipient taps actually points at the live web-app, not at their own
// phone's `localhost:3000`.
//
// In local development the env var is unset and we fall back to
// `window.location.origin`, which is the dev-server origin. Local testing
// against a real phone requires exposing the dev server via a tunnel
// (ngrok, Cloudflare Tunnel) or using a Vercel preview deploy.
const WEB_APP_BASE_URL: string =
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

// Date-only, for the convocatoria header. `formatMatchDate` includes the
// kickoff time, which used to make the message read "…sábado, 24 de
// octubre, 17:00 a las 17:00" — the same time twice. The time is appended
// separately below, so this formatter deliberately omits it.
function formatMatchDay(date?: string | null): string {
  const d = parseSidgadDate(date, null);
  if (!d) return '';
  // See formatMatchDate for why 'UTC' is the right timeZone here.
  return d.toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

/**
 * The short links the app resolved for a share, if any.
 *
 * `match` is the one-tap add-to-calendar link, `team` the squad's calendar.
 * Both are optional: when the link store cannot be reached, the message is
 * composed with the canonical URLs instead — which is exactly what it did
 * before short links existed.
 */
type ShortLinks = { match?: string; team?: string };

// How long the share waits for the link store before giving up and using the
// canonical URLs. A share that waits on an unreachable store is worse than a
// share with a long URL.
const SHORT_LINK_TIMEOUT_MS = 2500;

/**
 * Ask the link store for the short URLs of this fixture's two links.
 *
 * Best-effort by design: any failure — timeout, non-2xx, malformed answer —
 * resolves to an empty map, and the caller composes the message with the
 * canonical URLs. The club never sees an error, because there is nothing for
 * them to act on: the message is complete either way.
 */
async function resolveShortLinks(
  game: Game,
  clubName: string,
  competition?: CompetitionId,
  clubCode?: number,
): Promise<ShortLinks> {
  if (competition === undefined || clubCode === undefined) return {};

  const club: ClubType = {
    competition,
    code: clubCode,
    name: clubName,
    username: '',
  };

  const squad = squadFor(game, club);

  const requests: Record<string, unknown>[] = [];
  if (isMatchReady(game)) {
    requests.push({
      kind: 'match_calendar',
      date: game.date,
      time: game.time,
      local: game.local,
      visit: game.visit,
      localCode: game.localCode,
      visitCode: game.visitCode,
      location: game.location,
      map: game.map,
    });
  }
  if (squad) {
    // The league travels with the squad: the same team name exists in
    // several leagues, and the calendar link must point at the team of THIS
    // fixture, not at every team that happens to share the name.
    requests.push({ kind: 'team_calendar', squad: squad.name, league: squad.league });
  }
  if (requests.length === 0) return {};

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SHORT_LINK_TIMEOUT_MS);
  try {
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: requests }),
      signal: controller.signal,
    });
    if (!res.ok) return {};

    const data = (await res.json()) as { links?: { kind?: string; url?: string }[] };
    const resolved: ShortLinks = {};
    for (const link of data.links ?? []) {
      if (!link.url) continue;
      if (link.kind === 'match_calendar') resolved.match = link.url;
      if (link.kind === 'team_calendar') resolved.team = link.url;
    }
    return resolved;
  } catch {
    return {};
  } finally {
    window.clearTimeout(timer);
  }
}

function buildWhatsappUrl(
  game: Game,
  clubName: string,
  competition?: CompetitionId,
  clubCode?: number,
  shortLinks?: ShortLinks,
): string {
  let text = '';

  // Both link builders need the whole club (code + name), because "which side
  // of the fixture is ours" is decided from the `param_game` codes as well as
  // the name aliases. Reassembled here from the props the board already
  // receives; `username` is unused by either builder.
  const club: ClubType | null =
    competition !== undefined && clubCode !== undefined
      ? { competition, code: clubCode, name: clubName, username: '' }
      : null;

  // Header: the fixture itself, bolded. Leading with the matchup reads
  // better than burying it under a sentence about when it is.
  text += `*${game.local ?? '?'} - ${game.visit ?? '?'}*`;

  // Facts, one per line, each prefixed with an emoji so the block scans
  // at a glance on a phone instead of reading as a run-on sentence.
  const day = formatMatchDay(game.date);
  if (day) {
    // Only print a time when the federation has confirmed one. Rendering a
    // sentinel like "--:--" would tell the squad to turn up at a time that
    // does not exist yet.
    if (hasTime(game.time)) {
      text += `\n\n🗓 ${day}, ${game.time}`;
    } else {
      text += `\n\n🗓 ${day} (hora por confirmar)`;
    }
  }
  if (game.location) {
    text += `\n📍 ${game.location}`;
  }
  // The map URL on its own line. Previously it was appended to the venue
  // with a " - ", which made the line long enough to wrap and left a bare
  // goo.gl link with nothing to describe it.
  if (game.map) {
    text += `\n🗺 ${game.map}`;
  }

  // One-tap "Add to calendar" for THIS match — the single-match landing page.
  // Only for ready matches: when `buildCalendarUrl` returns null (missing
  // date, sentinel time, etc.) the whole line is omitted so pending matches
  // keep their current text.
  // The URL goes on its own line because WhatsApp renders it as a tappable
  // chip there; inline it just trails the label.
  //
  // The canonical URL decides WHETHER the line exists (it is null for a
  // pending match); the short link, when the store answered, decides only
  // WHICH url the line carries.
  const canonicalMatchUrl = club ? buildCalendarUrl(game, club, WEB_APP_BASE_URL) : null;
  const calendarUrl = canonicalMatchUrl ? shortLinks?.match ?? canonicalMatchUrl : null;
  if (calendarUrl) {
    text += `\n📅 Añadir al calendario:\n${calendarUrl}`;

    // The player roster, right under the link that invites the squad to
    // turn up: the volunteers write the numbers down here. It hangs off the
    // link on purpose — the two disappear together, so a pending match
    // (which has no add-to-calendar link) never carries a player list
    // nobody asked for.
    text += '\n\nJugadores:\n1.';
  }

  // Roster scaffold the volunteers fill in.
  text += '\n\nPorteros:\n1.';
  text += '\n\nDelegado:';
  if ((game.local || '').includes(clubName)) {
    text += '\nAnotador:';
  }
  text += '\n\nNo puede:';

  // Link to the squad's public team calendar — the full upcoming schedule,
  // rather than the single match being convoked. Unlike the add-to-calendar
  // line above, this one has NO readiness gate: the squad name is readable
  // off any fixture, so the builder can always derive it. Only a fixture
  // whose squad cannot be determined at all omits the line.
  //
  // It goes at the BOTTOM of the message: the two links serve different
  // intents and both are present, but the team calendar is the standing
  // reference, not the action for this fixture — so it closes the message,
  // after the roster the volunteers are filling in.
  const canonicalTeamUrl = club
    ? buildTeamCalendarUrl(club, squadFor(game, club), WEB_APP_BASE_URL)
    : null;
  const teamUrl = canonicalTeamUrl ? shortLinks?.team ?? canonicalTeamUrl : null;
  if (teamUrl) {
    // Blank line before the block, the same spacing every other block uses.
    text += `\n\n📅 Calendario del equipo:\n${teamUrl}`;
  }

  text += '\n\n';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function hasTime(time?: string | null): boolean {
  if (!time) return false;
  const trimmed = time.trim();
  if (!trimmed) return false;
  // Treat sentinel / placeholder times as "not ready"
  if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
  return /\d/.test(trimmed);
}

function isMatchReady(game: Game): boolean {
  return Boolean(game.date) && hasTime(game.time);
}

export function MatchesBoard({
  clubName,
  competition,
  clubCode,
  matches,
  error,
  initialSent = {},
}: {
  clubName: string;
  competition?: CompetitionId;
  clubCode?: number;
  matches?: Game[];
  error?: string;
  initialSent?: Record<string, string>;
}) {
  const [today, setToday] = useState<Date | null>(null);
  const [localSent, setLocalSent] = useState<Record<string, string>>(initialSent);
  // The selected squads, stored as squad keys (league + name), not as bare
  // names: the same team name exists in several leagues, and a selection of
  // "DOMINICOS A" must say WHICH one.
  const [selectedSquads, setSelectedSquads] = useState<string[]>([]);
  const [filterHydrated, setFilterHydrated] = useState(false);

  const club: ClubType = useMemo(
    () => ({
      competition: competition ?? 'FMP',
      code: clubCode ?? -1,
      name: clubName,
      username: '',
    }),
    [clubName, competition, clubCode],
  );

  // Distinct, sorted list of the user's own squads that appear in the
  // upcoming agenda. `squadsForMatches` is the shared derivation — the same
  // one the /links page offers as a picker — so what we offer here matches
  // what `getMatchesForClub` already filtered down to.
  //
  // The derivation uses the upstream club code first and the club's name
  // aliases as a fallback, exactly like the agenda filter does. A name-only
  // derivation found NO squads at all for most clubs — the federation prints
  // `DOMINICOS A` where the catalogue says `CLUB AA DOMINICOS` — and the
  // filter dropdown then never appeared.
  const squadList = useMemo<Squad[]>(
    () => squadsForMatches(matches ?? [], club),
    [matches, club],
  );

  // Squad keys, used to decide whether a stored selection still applies.
  const availableKeys = useMemo(
    () => new Set(squadList.map(squadKey)),
    [squadList],
  );

  // The team names that more than one league uses. Only those need the league
  // spelled out in the dropdown.
  const ambiguousNames = useMemo(() => ambiguousSquadNames(squadList), [squadList]);

  // Selected squads, intersected with the current squad list so a
  // squad that disappeared upstream falls out of the active filter.
  const activeSelection = useMemo(
    () => selectedSquads.filter((key) => availableKeys.has(key)),
    [selectedSquads, availableKeys],
  );

  // Filtered list shown to the user. An empty selection is equivalent to
  // "Todos" — every fixture is visible.
  const visibleMatches = useMemo<Game[]>(() => {
    if (!matches) return [];
    if (activeSelection.length === 0) return matches;
    const selected = new Set(activeSelection);
    return matches.filter(
      (m) =>
        (m.local && selected.has(squadKey({ name: m.local, league: m.league }))) ||
        (m.visit && selected.has(squadKey({ name: m.visit, league: m.league }))),
    );
  }, [matches, activeSelection]);

  useEffect(() => {
    // Use nowInMadrid so "today" matches the encoding of match dates
    // (Europe/Madrid components in UTC slots — see matchDate.ts).
    setToday(nowInMadrid());
    function refresh() {
      setToday(nowInMadrid());
    }
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  // Hydrate the persisted squad selection on first mount. Stale squads
  // (not present in the current squad list) are dropped silently per the
  // spec; missing/corrupt values fall back to "Todos" (empty selection).
  //
  // The stored shape is a list of `{ name, league }` pairs. Selections
  // stored before squads carried their league are plain names: they are
  // migrated to the squad of that name when it is unambiguous, and dropped
  // when the name maps to several leagues (picking one of them would be a
  // guess).
  useEffect(() => {
    if (filterHydrated) return;
    // Wait for the agenda: without it a legacy name cannot be resolved to a
    // squad.
    if (!matches) return;

    (async () => {
      const raw = await getItem(TEAM_FILTER_KEY);
      let parsed: unknown = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }
      if (Array.isArray(parsed)) {
        const cleaned: string[] = [];
        for (const entry of parsed) {
          if (entry && typeof entry === 'object') {
            const { name, league } = entry as { name?: unknown; league?: unknown };
            if (typeof name !== 'string' || !name) continue;
            const key = squadKey({
              name,
              league: typeof league === 'string' ? league : null,
            });
            if (availableKeys.has(key)) cleaned.push(key);
            continue;
          }
          if (typeof entry !== 'string' || !entry) continue;
          const matchesForName = squadList.filter((s) => s.name === entry);
          if (matchesForName.length === 1) {
            cleaned.push(squadKey(matchesForName[0]));
          }
        }
        setSelectedSquads(cleaned);
      }
      setFilterHydrated(true);
    })();
  }, [matches, squadList, availableKeys, filterHydrated]);

  // Persist selection on change, but only after hydration so we never
  // overwrite stored value with the empty default on first paint. Errors
  // from `setItem` (quota, private mode) are already swallowed inside the
  // storage helper.
  //
  // The stored shape is a list of `{ name, league }` pairs: the league is
  // what tells two same-named teams of the same club apart.
  useEffect(() => {
    if (!filterHydrated) return;
    const stored = squadList
      .filter((squad) => activeSelection.includes(squadKey(squad)))
      .map((squad) => ({ name: squad.name, league: squad.league }));
    setItem(TEAM_FILTER_KEY, JSON.stringify(stored));
  }, [filterHydrated, activeSelection, squadList]);
  if (error) {
    return (
      <div className={styles.page}>
        <PageHeader count={0} />
        <div className={styles.error} role="alert">
          <strong>No se pudo cargar la agenda</strong>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!matches) {
    return (
      <div className={styles.page}>
        <PageHeader count={null} />
        <div className={styles.loading}>
          <div className={styles.spinner} aria-hidden />
          <span>Cargando próximos partidos…</span>
        </div>
      </div>
    );
  }

  if (visibleMatches.length === 0) {
    const filteredByTeam = squadList.length > 0 && matches.length > 0;
    return (
      <div className={styles.page}>
        <PageHeader count={0} />
        <div className={styles.noMatches}>
          <span className={styles.noMatchesTitle}>
            {filteredByTeam ? 'Ningún partido coincide con el filtro' : 'Sin partidos por ahora'}
          </span>
          <span className={styles.noMatchesHint}>
            {filteredByTeam
              ? 'Marca más equipos arriba para ver sus partidos.'
              : 'Vuelve más tarde o revisa la configuración.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader count={visibleMatches.length} />
      <ShareInfoPanel />
      {squadList.length > 0 && (
        <TeamFilter
          options={squadList.map((squad) => ({
            key: squadKey(squad),
            label: squadLabel(squad, ambiguousNames),
          }))}
          selected={activeSelection}
          onChange={setSelectedSquads}
        />
      )}
      <div className={styles.table}>
        {visibleMatches.map((row, i) => {
          const formatted = formatMatchDate(row.date, row.time);
          const day = formatDayLabel(row.date);
          const time = row.time ?? '';
          const ready = isMatchReady(row);
          const matchKey =
            competition && clubCode !== undefined
              ? deriveMatchKey(competition, clubCode, row)
              : null;
          const sentAt = ready && matchKey ? localSent[matchKey] : undefined;
          const isSent = Boolean(sentAt);
          const isZebra = i % 2 === 1;
          const prevKey = i > 0 ? matchWeekKey(visibleMatches[i - 1]) : null;
          const showSeparator =
            i === 0 ? false : prevKey !== matchWeekKey(row);
          const isToday = today ? isMatchToday(row, today) : false;
          return (
            <React.Fragment key={`row-${i}`}>
              {showSeparator && (
                <div
                  className={styles.weekSeparator}
                  aria-hidden
                  data-testid="week-separator"
                />
              )}
            <div
              key={`${row.date}-${row.time}-${row.local}-${row.visit}-${i}`}
              className={`${styles.matchRow} ${isZebra ? styles.zebra : ''} ${
                ready ? '' : styles.notReady
              } ${isSent ? styles.sentRow : ''}`}
            >
              <div className={styles.matchMain}>
                <div className={styles.matchTopRow}>
                  {row.league && (
                    <span className={styles.matchLeague}>{row.league}</span>
                  )}
                  {!ready && (
                    <span
                      className={styles.pendingBadge}
                      title="La federación aún no ha confirmado la hora de este partido."
                    >
                      <span aria-hidden>⏳</span>
                      <span>Pendiente</span>
                    </span>
                  )}
                </div>
                <span className={styles.matchTeams}>
                  {row.local ?? '?'} <span style={{ color: 'var(--text-subtle)' }}>vs</span> {row.visit ?? '?'}
                </span>
                <div className={styles.matchMeta}>
                  {day ? (
                    <span title={formatted}>
                      <span aria-hidden>🗓</span>
                      {day}
                    </span>
                  ) : (
                    <span className={styles.matchNoDate}>
                      <span aria-hidden>⏱</span>
                      Sin fecha y hora
                    </span>
                  )}
                  {ready ? (
                    <span>
                      <span aria-hidden>⏰</span>
                      {time}
                    </span>
                  ) : row.date ? (
                    <span className={styles.matchPendingTime}>
                      <span aria-hidden>⏰</span>
                      hora por confirmar
                    </span>
                  ) : null}
                  {row.location && (
                    <span>
                      <span aria-hidden>📍</span>
                      {row.map ? (
                        <a
                          className={styles.locationPill}
                          href={row.map}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.location}
                        </a>
                      ) : (
                        row.location
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.matchActions}>
                {sentAt && matchKey && (
                  <span className={styles.sentBadge}>
                    <span aria-hidden>✓</span>
                    <span>Enviado · {formatSentDate(sentAt)}</span>
                  </span>
                )}
                {!ready ? null : isToday ? (
                  <span
                    className={styles.todayPill}
                    aria-label="Partido de hoy"
                    title="Este partido es hoy"
                  >
                    <span aria-hidden>⏰</span>
                    <span>¡Hoy!</span>
                  </span>
                ) : (
                  <a
                    className={styles.sendWhatsButton}
                    href={buildWhatsappUrl(row, clubName, competition, clubCode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Compartir ${row.local} vs ${row.visit} por WhatsApp`}
                    onClick={(e) => {
                      if (!matchKey) return;
                      e.preventDefault();

                      // The tab is opened SYNCHRONOUSLY, on the user
                      // gesture, because a browser only allows a popup that
                      // was requested inside the gesture. The short links
                      // are resolved while the tab sits on about:blank, and
                      // the tab is pointed at WhatsApp when they arrive (or
                      // straight away, with the canonical URLs, if they do
                      // not).
                      const tab = window.open('about:blank', '_blank');
                      const openWhatsapp = (url: string) => {
                        if (tab) {
                          tab.location.href = url;
                        }
                      };

                      void resolveShortLinks(row, clubName, competition, clubCode).then(
                        (shortLinks) => {
                          openWhatsapp(
                            buildWhatsappUrl(row, clubName, competition, clubCode, shortLinks),
                          );
                        },
                      );

                      const now = new Date().toISOString();
                      setLocalSent((prev) => ({ ...prev, [matchKey]: now }));
                      fetch('/api/matches/sent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ matchKey }),
                      }).catch(() => {
                        // Optimistic state stays for the current session.
                      });
                    }}
                  >
                    <span aria-hidden>📱</span>
                    <span>Enviar</span>
                  </a>
                )}
              </div>
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function PageHeader({ count }: { count: number | null }) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>Próximos partidos</h1>
        <p className={styles.pageSubtitle}>
          Partidos agendados por la federación para tu club.
        </p>
      </div>
      {count !== null && (
        <div className={styles.toolbar}>
          <span className={styles.toolbarCount}>{count}</span>
          <span>{count === 1 ? 'partido' : 'partidos'}</span>
        </div>
      )}
    </div>
  );
}

function ShareInfoPanel() {
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await getItem(INFO_DISMISS_KEY);
      setDismissed(raw === 'true');
      setHydrated(true);
    })();
  }, []);

  if (!hydrated || dismissed) return null;

  async function dismiss() {
    await setItem(INFO_DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className={styles.infoPanel} role="region" aria-label="Cómo funciona Enviar">
      <button
        type="button"
        className={styles.infoHeader}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.infoIcon} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <span className={styles.infoHeaderText}>
          <span className={styles.infoTitle}>Cómo funciona “Enviar”</span>
          <span className={styles.infoHint}>
            El comportamiento cambia según el dispositivo.
          </span>
        </span>
        <svg
          className={`${styles.infoChevron} ${open ? styles.open : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className={styles.infoBody}>
          <p className={styles.infoIntro}>
            El botón <strong>Enviar</strong> abre una conversación de WhatsApp
            con el mensaje del partido ya escrito. Necesitas tener WhatsApp
            instalado o usar la versión web.
          </p>

          <p className={styles.infoIntro}>
            El marcador <strong>Enviado</strong> se registra en el momento de
            pulsar Enviar; la app no puede confirmar que el mensaje haya sido
            enviado desde WhatsApp.
          </p>

          <div className={styles.infoDevices}>
            <div className={styles.infoDevice}>
              <span className={styles.infoDeviceHeader}>
                <span aria-hidden>📱</span>
                <span>Móvil (Android / iOS)</span>
              </span>
              <span className={styles.infoDeviceBody}>
                Pulsa <strong>Enviar</strong> y la app de WhatsApp se abre con el
                mensaje listo. Solo tienes que elegir el chat del grupo.
                <br />
                <strong>Requisito:</strong> WhatsApp instalado en el teléfono.
              </span>
            </div>

            <div className={styles.infoDevice}>
              <span className={styles.infoDeviceHeader}>
                <span aria-hidden>💻</span>
                <span>Escritorio (Windows / Mac / Linux)</span>
              </span>
              <span className={styles.infoDeviceBody}>
                Pulsa <strong>Enviar</strong> y se abre{' '}
                <strong>web.whatsapp.com</strong> en una pestaña nueva con el
                mensaje precargado. Pega el texto en el grupo correspondiente.
                <br />
                <strong>Requisito:</strong> tener sesión abierta en WhatsApp
                Web o abrir la URL manualmente.
              </span>
            </div>
          </div>

          <button type="button" className={styles.infoDismiss} onClick={dismiss}>
            No volver a mostrar
          </button>
        </div>
      )}
    </div>
  );
}

function TeamFilter({
  options,
  selected,
  onChange,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const todosChecked = options.length > 0 && selected.length === options.length;

  function toggleSquad(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  function toggleTodos() {
    onChange(todosChecked ? [] : options.map((option) => option.key));
  }

  // Close on outside click + Escape; do not close when the click lands
  // inside the panel itself.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (panelRef.current && target && panelRef.current.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerLabel =
    selected.length === 0 || todosChecked
      ? 'Todos los equipos'
      : selected.length === 1
        ? '1 equipo'
        : `${selected.length} de ${options.length} equipos`;

  return (
    <div className={styles.teamFilter}>
      <button
        type="button"
        className={styles.teamFilterTrigger}
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden>⚽</span>
        <span className={styles.teamFilterTriggerLabel}>Equipos</span>
        <span className={styles.teamFilterBadge}>{triggerLabel}</span>
        <svg
          className={`${styles.teamFilterChevron} ${open ? styles.open : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          className={styles.teamFilterPanel}
          role="dialog"
          aria-label="Filtrar por equipo"
        >
          <label className={styles.teamFilterOption}>
            <input
              type="checkbox"
              className={styles.teamFilterOptionCheck}
              checked={todosChecked}
              onChange={toggleTodos}
              aria-label="Todos los equipos"
            />
            <span className={styles.teamFilterOptionLabel}>Todos</span>
          </label>
          <div className={styles.teamFilterDivider} aria-hidden />
          {options.map((option) => {
            const checked = selected.includes(option.key);
            return (
              <label key={option.key} className={styles.teamFilterOption}>
                <input
                  type="checkbox"
                  className={styles.teamFilterOptionCheck}
                  checked={checked}
                  onChange={() => toggleSquad(option.key)}
                  aria-label={`Filtrar por ${option.label}`}
                />
                <span className={styles.teamFilterOptionLabel}>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
