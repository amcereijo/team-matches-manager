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

function readParamGame(el: any): { gameId: number | null; localCode: number | null; visitCode: number | null } {
  const raw = (el as any).attribs?.['param_game'];
  if (typeof raw !== 'string') return { gameId: null, localCode: null, visitCode: null };
  const parts = raw.split('_');
  // sidgad format: <modality>_<round>_<localCode>_<visitCode>_<competitionId>
  // e.g. "2_7_412_406_4797" → local 412, visit 406, competition 4797
  // There is no per-fixture id in the attribute, so we derive a stable key
  // from (competitionId, localCode, visitCode, date, time) in the caller.
  const localCode = parts[2] !== undefined ? Number.parseInt(parts[2], 10) : NaN;
  const visitCode = parts[3] !== undefined ? Number.parseInt(parts[3], 10) : NaN;
  const competitionId = parts[4] !== undefined ? Number.parseInt(parts[4], 10) : NaN;
  return {
    gameId: Number.isFinite(competitionId) ? competitionId : null,
    localCode: Number.isFinite(localCode) ? localCode : null,
    visitCode: Number.isFinite(visitCode) ? visitCode : null,
  };
}

export async function fetchFmpMatches(): Promise<{ teams: Set<string>; fields: Map<string, string>; matches: Game[] }> {
  const cfg = COMPETITIONS.FMP;
  const form = new FormData();
  form.append('cliente', cfg.cliente);
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
    // The league cell is a styled div whose text carries the markup's own
    // padding (" LIGA SENIOR 1"). It is trimmed because the league is part
    // of a squad's identity: it travels in the calendar URL and in the
    // filter labels, and a stray space would make two spellings of the same
    // league look different.
    const league = trimLocation(decodeHtml($(nodes[3]?.childNodes?.[0]).html()));
    const date = decodeHtml($(nodes[5]).html());
    const time = decodeHtml($(nodes[7]).html());
    const local = decodeHtml($(nodes[11]).html());
    const visit = decodeHtml($(nodes[15]).html());
    const location = trimLocation(decodeHtml($(nodes[19]).html()));
    const map = LOCATION_MAP[location] ?? '';
    const { gameId, localCode, visitCode } = readParamGame(el);

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
      localCode,
      visitCode,
      gameId,
    });
  });

  return { teams, fields, matches };
}
