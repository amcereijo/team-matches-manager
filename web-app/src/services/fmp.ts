import axios from 'axios';
import { load } from 'cheerio';
import { LOCATION_MAP } from '../constants/locations';
import he from 'he';

export type Game = {
  league: string | null;
  date: string | null;
  time: string | null;
  local: string | null;
  visit: string | null;
  location: string | null;
  map: string | null;
};

const ENDPOINT = 'https://sidgad.cloud/shared/portales_files/agenda_portales.php';

function decodeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const text = String(html);
  return he.decode(text);
}

export async function getMatches(clubCode: number): Promise<Game[]> {
  const form = new FormData();
  form.append('cliente', 'fmp');
  form.append('idm', '1');
  form.append('id_temp', '31');

  const response = await axios.post(ENDPOINT, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const $ = load(String(response.data));

  const games: Game[] = [];
  $('.fila_agenda').each((_i, el) => {
    const paramGame = (el as any).attribs?.['param_game'];
    if (!paramGame || !String(paramGame).match(clubCode.toString())) return;

    const nodes = (el as any).childNodes as any[];
    const location = decodeHtml($(nodes[19]).html());
    const map = LOCATION_MAP[location.trim()];

    games.push({
      league: decodeHtml($(nodes[3].childNodes[0]).html()),
      date: decodeHtml($(nodes[5]).html()),
      time: decodeHtml($(nodes[7]).html()),
      local: decodeHtml($(nodes[11]).html()),
      visit: decodeHtml($(nodes[15]).html()),
      location: location,
      map: map ?? '',
    });
  });

  return games;
}
