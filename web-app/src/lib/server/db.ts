import fs from 'fs';
import path from 'path';
import { createClient, type Client } from '@libsql/client';

// The single libSQL client for the app's server-side stores.
//
// Both stores (sent matches and short links) live in the SAME database and
// are reached through the SAME env vars. That is deliberate: a second
// database would mean a second Vercel integration, a second credential to
// rotate and a second thing to back up, for the sake of one more table.
//
// The env-var names still say `SENT_STORE_*` because that is what the
// existing deployment already sets. The legacy Turso-integration names
// (`SENT_STORE_TURSO_DATABASE_URL` / `SENT_STORE_TURSO_AUTH_TOKEN`) are
// honoured as fallbacks so a Vercel deployment wired up with the Turso
// integration keeps working without renaming anything.

function getClientConfig(): { url: string; authToken?: string } {
  const url =
    process.env.SENT_STORE_URL ??
    process.env.SENT_STORE_TURSO_DATABASE_URL ??
    'file:./data/sent.sqlite';
  const authToken =
    process.env.SENT_STORE_AUTH_TOKEN ?? process.env.SENT_STORE_TURSO_AUTH_TOKEN;
  return { url, authToken };
}

let clientInstance: Client | null = null;

/**
 * The lazily-created libSQL client.
 *
 * One client per process, shared by every store: a second client would open a
 * second connection to the same database for no benefit.
 */
export async function getClient(): Promise<Client> {
  if (!clientInstance) {
    const { url, authToken } = getClientConfig();

    // A `file:` URL points at a path that may not exist yet — the local
    // development database lives in a gitignored directory that a fresh
    // clone does not have.
    if (url.startsWith('file:')) {
      const filePath = url.slice('file:'.length);
      const dir = path.dirname(filePath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    clientInstance = createClient({ url, authToken });
  }
  return clientInstance;
}

/**
 * The sent-match store's schema, moved verbatim out of `sentStore.ts`.
 *
 * `CREATE TABLE IF NOT EXISTS` is idempotent, so running it on every
 * connection is free and removes the "the table might not exist yet" class of
 * bug.
 */
export async function ensureSentStoreSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS match_send (
      club_code INTEGER NOT NULL,
      competition TEXT NOT NULL,
      match_key TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      UNIQUE (club_code, competition, match_key)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_match_send_club_competition
      ON match_send (club_code, competition)
  `);
}
