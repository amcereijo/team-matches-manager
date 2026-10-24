// Shared helpers for matching team names to a club's own squads. Lives in
// `lib/` (not `services/`) because it is imported by both server modules
// (`services/competition.ts`, which uses it to filter the agenda server-side)
// and client components (`app/(app)/calendario/MatchesBoard.tsx`, which uses
// it to derive the squad filter dropdown, and `app/(app)/links/page.tsx`,
// which uses it to offer a squad picker). Keeping a single definition
// guarantees the two surfaces agree on "what counts as my team".

import type { ClubType, Game, Squad } from '@/types';

export function normalizeClubName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function clubAliases(name: string): string[] {
  const upper = normalizeClubName(name);
  const aliases = new Set<string>([upper]);
  for (const suffix of [' A', ' B', ' C', ' D', ' E']) {
    if (upper.endsWith(suffix)) {
      aliases.add(upper.slice(0, -suffix.length));
    }
  }
  return Array.from(aliases);
}

export function isClubMatch(team: string | null, aliases: string[]): boolean {
  if (!team) return false;
  const upper = normalizeClubName(team);
  return aliases.some((alias) => upper === alias || upper.startsWith(`${alias} `));
}

/**
 * Which side of a fixture belongs to the club.
 *
 * The upstream `param_game` codes are authoritative and are consulted FIRST:
 * a club's catalogue name rarely matches the name the federation prints on the
 * fixture (`CLUB AA DOMINICOS` is `DOMINICOS A` upstream, `ALAMEDA OSUNA HP`
 * is `ALAMEDA DE OSUNA A`), so a name-only test misses the club entirely and a
 * name-only test that DOES hit can pick the wrong side when a rival shares
 * the club's name. The name aliases are the fallback, for clubs whose fixtures
 * carry no usable code.
 *
 * Returns `null` when neither side can be attributed to the club.
 */
export function ourSide(
  game: Game,
  club: Pick<ClubType, 'code' | 'name'>,
): 'local' | 'visit' | null {
  if (game.localCode !== null && game.localCode === club.code) return 'local';
  if (game.visitCode !== null && game.visitCode === club.code) return 'visit';
  const aliases = clubAliases(club.name);
  if (isClubMatch(game.local, aliases)) return 'local';
  if (isClubMatch(game.visit, aliases)) return 'visit';
  return null;
}

/**
 * A squad's identity key.
 *
 * A squad is NOT just a team name: the same club fields the same team name in
 * several leagues (`DOMINICOS A` is in ALEVÍN GRUPO A, INFANTIL GRUPO B,
 * JUVENIL GRUPO B and SENIOR MASCULINO), and each of those is a different team
 * with its own fixtures. The league is therefore part of the identity, and
 * every comparison in the app goes through this key so that "same name, other
 * league" can never be mistaken for "same squad".
 */
export function squadKey(squad: Squad): string {
  return `${normalizeClubName(squad.league ?? '')}|${normalizeClubName(squad.name)}`;
}

/** The league names of two squads match when they are the same string. */
export function sameLeague(a: string | null, b: string | null): boolean {
  return normalizeClubName(a ?? '') === normalizeClubName(b ?? '');
}

/**
 * The club's own squads, as they appear on the fixtures.
 *
 * There is no catalogue of squads — they exist only on fixture rows, and the
 * set drifts over a season — so the squad list is derived, the same way the
 * Calendario's team filter derives it. Sorted by team name and then by league,
 * so a club's teams read alphabetically and the leagues of one team stay
 * together.
 */
export function squadsForMatches(
  matches: Game[],
  club: Pick<ClubType, 'code' | 'name'>,
): Squad[] {
  const byKey = new Map<string, Squad>();
  for (const row of matches) {
    const side = ourSide(row, club);
    if (!side) continue;
    const name = side === 'local' ? row.local : row.visit;
    if (!name) continue;
    const squad: Squad = { name, league: row.league };
    byKey.set(squadKey(squad), squad);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'es');
    if (byName !== 0) return byName;
    return (a.league ?? '').localeCompare(b.league ?? '', 'es');
  });
}

/**
 * The team names that are used by more than one league of this club.
 *
 * Only those names need the league spelled out: `DOMINICOS A` is ambiguous
 * (four leagues), while a team that only plays in one league is already
 * unambiguous on its own. The full league names are long (`CTO AUT ALEVÍN -
 * 1ª DIVISIÓN - 1ª FASE - GRUPO A`), so printing them everywhere would make
 * the filter unreadable.
 */
export function ambiguousSquadNames(squads: Squad[]): Set<string> {
  const counts = new Map<string, number>();
  for (const squad of squads) {
    const key = normalizeClubName(squad.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ambiguous = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) ambiguous.add(name);
  }
  return ambiguous;
}

/**
 * How a squad is shown in the UI.
 *
 * The league is appended only when the name alone is ambiguous — the club
 * needs to tell "DOMINICOS A of ALEVÍN GRUPO A" from "DOMINICOS A of JUNIOR".
 */
export function squadLabel(squad: Squad, ambiguous: Set<string>): string {
  if (squad.league && ambiguous.has(normalizeClubName(squad.name))) {
    return `${squad.name} — ${squad.league}`;
  }
  return squad.name;
}
