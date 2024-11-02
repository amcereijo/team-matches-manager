import { Buffer } from 'buffer';
global.Buffer = Buffer;

import axios from 'axios';
import FormData from 'form-data';
// import { load } from 'cheerio';
import { load } from 'react-native-cheerio';
import {LOCATION_MAP} from '../constants/locations';
import he from 'he';

export type Game = {
  league: string | null,
  date: string | null,
  time: string | null,
  local: string | null,
  visit: string | null,
  location: string | null,
  map: string | null,
}

export async function getMatches(clubCode: number): Promise<Game[]> {
  const url = 'https://sidgad.cloud/shared/portales_files/agenda_portales.php';

  const form = new FormData();
  form.append('cliente', 'fmp');
  form.append('idm', 1);
  form.append('id_temp', 21);

  console.log('Fetching matches for club', clubCode);
  const response = await axios.post(
    url,
    form,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  console.log('Matches fetched!');

  const $ = load(String(response.data));

  const games: Game[] = [];
  $('.fila_agenda').each((i, el: any) => {
    const paramGame = el.attribs['param_game'];

    if(String(paramGame).match(clubCode.toString())) {
      const location = decodeHtml($(el.childNodes[19]).html());
      const map = LOCATION_MAP[location];

      games.push({
        league: $((el.childNodes[3]).childNodes[0]).html(),
        date: decodeHtml($(el.childNodes[5]).html()),
        time: decodeHtml($(el.childNodes[7]).html()),
        local: decodeHtml($(el.childNodes[11]).html()),
        visit: decodeHtml($(el.childNodes[15]).html()),
        location: location,
        map: map ? map : ''
      });
    }
  });

  return games;
}

function decodeHtml(html: string): string {
  if(html) {
    return he.decode(html);
  }
  return '';
}

