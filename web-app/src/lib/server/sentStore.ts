import type { Client } from '@libsql/client';
import type { CompetitionId } from '@/constants/competitions';
import type { ClubType, Game } from '@/types';
import { ensureSentStoreSchema, getClient } from '@/lib/server/db';

const COMPETITION_VALUES: CompetitionId[] = ['FMP', 'FGP'];

/**
 * The store's client, with its schema guaranteed to exist.
 *
 * The client itself and the env-var fallback chain live in `@/lib/server/db`
 * so the short-link store shares them; the schema bootstrap stays here
 * because the table is this store's own.
 */
async function getStore(): Promise<Client> {
  const client = await getClient();
  await ensureSentStoreSchema(client);
  return client;
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
  const parts = matchKey.split(':');

  // tuple:<competition>:<club_code>:<local>:<visit>:<date>:<time>
  if (matchKey.startsWith('tuple:')) {
    const date = parts[5];
    const time = parts[6];
    if (!date || !time) return false;
    const trimmed = time.trim();
    if (!trimmed) return false;
    if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
    return /\d/.test(trimmed);
  }

  // <competition>:<localCode>:<visitCode>:<date>:<time>
  const date = parts[3];
  const time = parts[4];
  if (!date || !time) return false;
  const trimmed = time.trim();
  if (!trimmed) return false;
  if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
  return /\d/.test(trimmed);
}

export async function getSentForClub(club: ClubType): Promise<Record<string, string>> {
  const client = await getStore();
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

  const client = await getStore();
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
