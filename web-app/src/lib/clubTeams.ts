// Shared helpers for matching team names to a club's own squads. Lives in
// `lib/` (not `services/`) because it is imported by both server modules
// (`services/competition.ts`, which uses it to filter the agenda server-side)
// and client components (`app/(app)/calendario/MatchesBoard.tsx`, which uses
// it to derive the squad filter dropdown, and `app/(app)/links/page.tsx`,
// which uses it to offer a squad picker). Keeping a single definition
// guarantees the two surfaces agree on "what counts as my team".

import type { Game } from '@/types';

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
 * The club's own squads, as they appear on the fixtures.
 *
 * There is no catalogue of squads — they exist only on fixture rows, and the
 * set drifts over a season — so the squad list is derived, the same way the
 * Calendario's team filter derives it. Sorted with the `es` collation so the
 * list reads the way the club writes its team names.
 */
export function squadsForMatches(matches: Game[], clubName: string): string[] {
  const aliases = clubAliases(clubName);
  const set = new Set<string>();
  for (const row of matches) {
    if (isClubMatch(row.local, aliases) && row.local) set.add(row.local);
    if (isClubMatch(row.visit, aliases) && row.visit) set.add(row.visit);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}