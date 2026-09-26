import axios from 'axios';
import { load } from 'cheerio';
import he from 'he';
import { COMPETITIONS } from '@/constants/competitions';
import { LOCATION_MAP } from '@/constants/locations';
import type { CompetitionId, Field, Game, MatchesResponse, Team } from '@/types';

function decodeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return he.decode(String(html));
}

function trimLocation(location: string): string {
  return location.replace(/\s+/g, ' ').trim();
}

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

export async function fetchCompetitionMatches(
  competition: CompetitionId,
): Promise<{ teams: Set<string>; fields: Map<string, string>; matches: Game[] }> {
  const cfg = COMPETITIONS[competition];
  const form = new FormData();
  form.append('cliente', competition.toLowerCase());
  form.append('idm', cfg.idm);
  form.append('id_temp', cfg.idTemp);

  const response = await axios.post(cfg.endpoint, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'text',
  });

  const $ = load(String(response.data));
  const teams = new Set<string>();
  const fields = new Map<string, string>();
  const matches: Game[] = [];

  $('.fila_agenda').each((_i, el) => {
    const nodes = (el as any).childNodes as any[];
    const league = decodeHtml($(nodes[3]?.childNodes?.[0]).html());
    const date = decodeHtml($(nodes[5]).html());
    const time = decodeHtml($(nodes[7]).html());
    const local = decodeHtml($(nodes[11]).html());
    const visit = decodeHtml($(nodes[15]).html());
    const location = trimLocation(decodeHtml($(nodes[19]).html()));
    const map = LOCATION_MAP[location] ?? '';

    if (local) teams.add(local);
    if (visit) teams.add(visit);
    if (location) fields.set(location, map);

    matches.push({
      league: league || null,
      date: date || null,
      time: time || null,
      local: local || null,
      visit: visit || null,
      location: location || null,
      map: map || null,
    });
  });

  return { teams, fields, matches };
}

export async function getMatchesForClub(
  clubCode: number,
): Promise<MatchesResponse> {
  const { CLUBS_MAP } = await import('@/constants/clubs');
  const club = CLUBS_MAP[clubCode];
  if (!club) {
    throw new Error(`Club ${clubCode} not found`);
  }

  const { teams, fields, matches } = await fetchCompetitionMatches(club.competition);
  const aliases = clubAliases(club.name);
  const filtered = matches.filter(
    (m) => isClubMatch(m.local, aliases) || isClubMatch(m.visit, aliases),
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
