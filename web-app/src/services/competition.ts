import { fetchFgpMatches } from './fgp';
import { fetchFmpMatches } from './fmp';
import type { ClubType, Field, MatchesResponse, Team } from '@/types';

function normalize(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}

function clubAliases(name: string): string[] {
  const upper = normalize(name);
  const aliases = new Set<string>([upper]);
  for (const suffix of [' A', ' B', ' C', ' D', ' E']) {
    if (upper.endsWith(suffix)) {
      aliases.add(upper.slice(0, -suffix.length));
    }
  }
  return Array.from(aliases);
}

function isClubMatch(team: string | null, aliases: string[]): boolean {
  if (!team) return false;
  const upper = normalize(team);
  return aliases.some((alias) => upper === alias || upper.startsWith(`${alias} `));
}

export async function getMatchesForClub(club: ClubType): Promise<MatchesResponse> {
  // The catalogue is composite-keyed (FMP-<code> / FGP-<code>) because sidgad
  // reuses numeric codes across federations. The session already knows which
  // (competition, code) the user picked; use the full club object so we don't
  // re-resolve the code (which would pick the wrong federation).
  const { teams, fields, matches } =
    club.competition === 'FGP' ? await fetchFgpMatches() : await fetchFmpMatches();
  const aliases = clubAliases(club.name);
  // Primary: match by `param_game` codes (sidgad's own filter uses this — see
  // `filtrar_agenda()` line 13234 in the upstream HTML). Fallback: name-based
  // alias match, which still works for FMP and for any future upstream that
  // omits `param_game`.
  const filtered = matches.filter(
    (m) =>
      m.localCode === club.code ||
      m.visitCode === club.code ||
      isClubMatch(m.local, aliases) ||
      isClubMatch(m.visit, aliases),
  );

  const teamList: Team[] = Array.from(teams)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => ({ name }));

  const fieldList: Field[] = Array.from(fields.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([name, map]) => ({ name, map: map || null }));

  return {
    competition: club.competition,
    club: { code: club.code, name: club.name },
    teams: teamList,
    fields: fieldList,
    matches: filtered,
  };
}