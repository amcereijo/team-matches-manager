import fs from 'fs';
import path from 'path';
import { createClient, type Client } from '@libsql/client';
import type { CompetitionId } from '@/constants/competitions';
import type { ClubType, Game } from '@/types';

const COMPETITION_VALUES: CompetitionId[] = ['FMP', 'FGP'];

function getClientConfig(): { url: string; authToken?: string } {
  const url = process.env.SENT_STORE_URL ?? 'file:./data/sent.sqlite';
  const authToken = process.env.SENT_STORE_AUTH_TOKEN;
  return { url, authToken };
}

let clientInstance: Client | null = null;

async function getClient(): Promise<Client> {
  if (!clientInstance) {
    const { url, authToken } = getClientConfig();

    if (url.startsWith('file:')) {
      const filePath = url.slice('file:'.length);
      const dir = path.dirname(filePath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    clientInstance = createClient({ url, authToken });
    await clientInstance.execute(`
      CREATE TABLE IF NOT EXISTS match_send (
        club_code INTEGER NOT NULL,
        competition TEXT NOT NULL,
        match_key TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        UNIQUE (club_code, competition, match_key)
      )
    `);
    await clientInstance.execute(`
      CREATE INDEX IF NOT EXISTS idx_match_send_club_competition
        ON match_send (club_code, competition)
    `);
  }
  return clientInstance;
}

function parseCompetitionFromKey(matchKey: string): CompetitionId | null {
  const parts = matchKey.split(':');
  if (parts.length < 2) return null;

  const competition = matchKey.startsWith('tuple:') ? parts[1] : parts[0];
  return COMPETITION_VALUES.includes(competition as CompetitionId)
    ? (competition as CompetitionId)
    : null;
}

export function matchIsReady(match: Game): boolean {
  if (!match.date) return false;
  if (!match.time) return false;
  const trimmed = match.time.trim();
  if (!trimmed) return false;
  if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
  return /\d/.test(trimmed);
}

function matchKeyIsReady(matchKey: string): boolean {
  if (!matchKey.startsWith('tuple:')) {
    // Game-id keys carry no date/time in the key; the UI only sends ready matches.
    return true;
  }

  // tuple:<competition>:<club_code>:<local>:<visit>:<date>:<time>
  const parts = matchKey.split(':');
  const date = parts[5];
  const time = parts[6];
  if (!date || !time) return false;
  const trimmed = time.trim();
  if (!trimmed) return false;
  if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
  return /\d/.test(trimmed);
}

export async function getSentForClub(club: ClubType): Promise<Record<string, string>> {
  const client = await getClient();
  const result = await client.execute({
    sql: 'SELECT match_key, sent_at FROM match_send WHERE club_code = ? AND competition = ?',
    args: [club.code, club.competition],
  });

  const sent: Record<string, string> = {};
  for (const row of result.rows) {
    sent[String(row.match_key)] = String(row.sent_at);
  }
  return sent;
}

export async function markSent(club: ClubType, matchKey: string): Promise<{ sentAt: string }> {
  const competition = parseCompetitionFromKey(matchKey);
  if (!competition) {
    throw new Error(`Invalid matchKey: ${matchKey}`);
  }

  if (!matchKeyIsReady(matchKey)) {
    throw new Error('Match is not ready');
  }

  const client = await getClient();
  const sentAt = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO match_send (club_code, competition, match_key, sent_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (club_code, competition, match_key) DO NOTHING
    `,
    args: [club.code, competition, matchKey, sentAt],
  });

  const selectResult = await client.execute({
    sql: 'SELECT sent_at FROM match_send WHERE club_code = ? AND competition = ? AND match_key = ?',
    args: [club.code, competition, matchKey],
  });

  const row = selectResult.rows[0];
  if (!row || row.sent_at === undefined || row.sent_at === null) {
    throw new Error('Failed to read sent_at after insert');
  }

  return { sentAt: String(row.sent_at) };
}
