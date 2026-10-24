import type { Client } from '@libsql/client';
import type { ClubType } from '@/types';
import type { CompetitionId } from '@/constants/competitions';
import { getClient } from '@/lib/server/db';
import {
  generateHash,
  isLinkExpired,
  normalizeHash,
  payloadFor,
  targetKeyFor,
  type LinkKind,
  type LinkPayload,
  type LinkRequest,
} from '@/lib/shortLink';

// The store for app-owned short links.
//
// One table in the same libSQL database as the sent-match store (see
// `@/lib/server/db`). Rows are scoped per club, exactly like `match_send`:
// the club's code and competition come from the session and are written on
// every row, so a query that forgets the club filter is a bug the unique
// constraint will not catch for us.
//
// The store is deliberately dumb: it knows how to find, create, refresh,
// deactivate and resolve a row. It does NOT know what a link *points at* —
// the canonical path is derived from the payload by `@/lib/shortLink`, so
// there is one definition of each path in the codebase.

export type StoredLink = {
  hash: string;
  clubCode: number;
  competition: CompetitionId;
  kind: LinkKind;
  targetKey: string;
  payload: LinkPayload;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};

/**
 * The link table's schema.
 *
 * The hash is the primary key because it is the public name of the row.
 *
 * The "one link per target" rule is enforced by a PARTIAL unique index over
 * the active rows only, not by a table-level UNIQUE on the target:
 *
 * - A club must have at most ONE active link per target — creating the same
 *   target twice returns the same link.
 * - A DEACTIVATED link must never be handed out again, and re-creating the
 *   target must mint a NEW hash so a URL the club deliberately killed does
 *   not come back to life.
 * - The deactivated row must survive, so the club can still see what it
 *   shared and can re-activate it.
 *
 * Those three rules cannot hold under a table-level UNIQUE on the target:
 * a deactivated row and a new active row would collide. The partial index
 * says exactly what is meant — "at most one ACTIVE link per target".
 */
async function createLinkTable(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS link (
      hash TEXT PRIMARY KEY,
      club_code INTEGER NOT NULL,
      competition TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      disabled_at TEXT
    )
  `);
}

/**
 * Rebuild the table when it was created by an earlier shape of this
 * feature — one that constrained the target with a table-level UNIQUE.
 *
 * SQLite cannot drop a table-level constraint without rebuilding the table,
 * so the rows are copied across. The columns are identical; only the
 * constraint differs.
 */
async function rebuildLegacyLinkTable(client: Client): Promise<void> {
  const existing = await client.execute({ sql: 'SELECT * FROM link', args: [] });
  const rows = existing.rows;

  await client.execute({ sql: 'DROP TABLE link', args: [] });
  await createLinkTable(client);

  for (const row of rows) {
    await client.execute({
      sql: `INSERT INTO link
              (hash, club_code, competition, kind, target_key, payload, created_at, updated_at, disabled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        String(row.hash),
        Number(row.club_code),
        String(row.competition),
        String(row.kind),
        String(row.target_key),
        String(row.payload),
        String(row.created_at),
        String(row.updated_at),
        row.disabled_at === null || row.disabled_at === undefined
          ? null
          : String(row.disabled_at),
      ],
    });
  }
}

async function ensureLinkSchema(client: Client): Promise<void> {
  const table = await client.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'link'", args: [],
  });
  const tableSql = table.rows[0]?.sql ? String(table.rows[0].sql) : '';

  if (/UNIQUE\s*\(\s*club_code/.test(tableSql)) {
    await rebuildLegacyLinkTable(client);
  } else {
    await createLinkTable(client);
  }

  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_link_active_target
      ON link (club_code, competition, kind, target_key)
      WHERE disabled_at IS NULL
  `);
}

async function getStore(): Promise<Client> {
  const client = await getClient();
  await ensureLinkSchema(client);
  return client;
}

/**
 * Read a row's payload.
 *
 * A row with an unreadable payload still resolves to *something*; the
 * canonical path derivation treats a missing field as "cannot derive",
 * which the resolver turns into the not-available page.
 */
function parsePayload(raw: unknown): LinkPayload {
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object') return parsed as LinkPayload;
  } catch {
    // Fall through to the empty payload.
  }
  return {};
}

function rowToLink(row: Record<string, unknown>): StoredLink {
  return {
    hash: String(row.hash),
    clubCode: Number(row.club_code),
    competition: String(row.competition) as CompetitionId,
    kind: String(row.kind) as LinkKind,
    targetKey: String(row.target_key),
    payload: parsePayload(row.payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    disabledAt: row.disabled_at === null || row.disabled_at === undefined
      ? null
      : String(row.disabled_at),
  };
}

/**
 * The club's ACTIVE link for a target, if it has one.
 *
 * Only active rows are considered: a deactivated link is never handed out
 * again, so creating the target again mints a new hash.
 */
async function findActiveByTarget(
  club: ClubType,
  kind: LinkKind,
  targetKey: string,
): Promise<StoredLink | null> {
  const client = await getStore();
  const result = await client.execute({
    sql: `SELECT * FROM link
          WHERE club_code = ? AND competition = ? AND kind = ? AND target_key = ?
            AND disabled_at IS NULL`,
    args: [club.code, club.competition, kind, targetKey],
  });

  const row = result.rows[0];
  if (!row) return null;
  return rowToLink(row as Record<string, unknown>);
}

/**
 * Create the link for a target, or return the club's existing one.
 *
 * Idempotent by target: asking twice for the same target yields the same
 * hash and leaves exactly one row. The payload is refreshed on every call,
 * so a link always points at the current known state of its target (a
 * corrected kickoff, a corrected venue).
 *
 * A deactivated link is NOT reused: creating the target again mints a NEW
 * hash, so a URL the club deliberately killed does not come back to life.
 * The same holds for a link whose fixture is over — it is stood down first,
 * and the target gets a new hash.
 */
export async function createOrReuseLink(
  club: ClubType,
  kind: LinkKind,
  request: LinkRequest,
): Promise<StoredLink> {
  const client = await getStore();
  const targetKey = targetKeyFor(club, kind, request);
  const payload = payloadFor(club, kind, request);
  let existing = await findActiveByTarget(club, kind, targetKey);

  // A link whose fixture is over is not handed out again: it cannot be
  // opened, and the club is owed a URL that works. Stand it down and mint a
  // new hash for the target.
  if (existing && isLinkExpired(kind, existing.payload)) {
    const now = new Date().toISOString();
    await client.execute({
      sql: 'UPDATE link SET disabled_at = ?, updated_at = ? WHERE hash = ?',
      args: [now, now, existing.hash],
    });
    existing = null;
  }

  if (existing) {
    const updatedAt = new Date().toISOString();
    await client.execute({
      sql: 'UPDATE link SET payload = ?, updated_at = ? WHERE hash = ?',
      args: [JSON.stringify(payload), updatedAt, existing.hash],
    });
    return { ...existing, payload, updatedAt };
  }

  const now = new Date().toISOString();
  const serialized = JSON.stringify(payload);

  // The hash is random, so a collision is vanishingly unlikely — but the
  // primary key is the only thing standing between two clubs' links, so the
  // insert is retried rather than assumed to succeed.
  for (let attempt = 0; attempt < 5; attempt++) {
    const hash = generateHash();
    try {
      await client.execute({
        sql: `INSERT INTO link
                (hash, club_code, competition, kind, target_key, payload, created_at, updated_at, disabled_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        args: [
          hash,
          club.code,
          club.competition,
          kind,
          targetKey,
          serialized,
          now,
          now,
        ],
      });
      return {
        hash,
        clubCode: club.code,
        competition: club.competition,
        kind,
        targetKey,
        payload,
        createdAt: now,
        updatedAt: now,
        disabledAt: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('UNIQUE constraint failed')) throw err;

      // Two things can collide here: the hash (astronomically unlikely) or
      // the active-target index (another request created the link first).
      // Re-read the target: if it exists now, it is the link the caller
      // wanted; otherwise the hash was taken and another one is due.
      const raced = await findActiveByTarget(club, kind, targetKey);
      if (raced) {
        await client.execute({
          sql: 'UPDATE link SET payload = ?, updated_at = ? WHERE hash = ?',
          args: [serialized, now, raced.hash],
        });
        return { ...raced, payload, updatedAt: now };
      }
      continue;
    }
  }

  throw new Error('Could not allocate a unique link hash');
}

/**
 * Every link the club owns.
 *
 * Scoped by the club's own code and competition — a club can never read
 * another club's links through this function.
 */
export async function listLinksForClub(club: ClubType): Promise<StoredLink[]> {
  const client = await getStore();
  const result = await client.execute({
    sql: `SELECT * FROM link
          WHERE club_code = ? AND competition = ?
          ORDER BY created_at DESC`,
    args: [club.code, club.competition],
  });

  return result.rows.map((row) => rowToLink(row as Record<string, unknown>));
}

/**
 * Stand down the club's match links whose fixture is over.
 *
 * A match link is good for the whole of its fixture's day and stops working
 * once that day is over. The resolver already refuses those links, so this
 * sweep is not what makes the rule true — it is what keeps the club's own
 * list and the store's "at most one ACTIVE link per target" rule truthful.
 *
 * Scoped to the calling club: per-club isolation is an invariant of this
 * store, and a club's request must not write to another club's rows.
 *
 * The links are DEACTIVATED, not deleted. The row survives, so the club can
 * still see what it shared — and, because a deactivated link is never handed
 * out again, creating that target afterwards mints a new hash.
 *
 * Returns the hashes it stood down.
 */
export async function expireStaleMatchLinks(club: ClubType): Promise<string[]> {
  const client = await getStore();

  const result = await client.execute({
    sql: `SELECT hash, payload FROM link
          WHERE club_code = ? AND competition = ? AND kind = 'match_calendar'
            AND disabled_at IS NULL`,
    args: [club.code, club.competition],
  });

  const stale = result.rows
    .map((row) => ({
      hash: String(row.hash),
      payload: parsePayload(row.payload),
    }))
    .filter((row) => isLinkExpired('match_calendar', row.payload))
    .map((row) => row.hash);

  if (stale.length === 0) return [];

  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE link
          SET disabled_at = ?, updated_at = ?
          WHERE hash IN (${stale.map(() => '?').join(', ')}) AND disabled_at IS NULL`,
    args: [now, now, ...stale],
  });

  return stale;
}

/**
 * Why a link's state could not be changed.
 *
 * `not_found` covers both an unknown hash and one owned by another club:
 * the caller must not be able to tell those apart either. `expired` is a
 * different answer — the club DOES own that link, and it cannot be brought
 * back to life because its fixture is over.
 */
export type LinkStateChange =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' };

/**
 * Deactivate or re-activate one of the club's links.
 *
 * Re-activating stands the other links for the same target down first. A
 * target has at most one ACTIVE link, so re-activating an old link hands the
 * target back to it — which is what the club asked for by clicking on that
 * link, and what keeps the one-active-link rule true.
 *
 * A match link whose fixture is over cannot be re-activated: it would hand
 * the club back a link that cannot resolve.
 */
export async function setLinkActive(
  club: ClubType,
  hash: string,
  active: boolean,
): Promise<LinkStateChange> {
  const normalized = normalizeHash(hash);
  if (!normalized) return { ok: false, reason: 'not_found' };

  const client = await getStore();
  const now = new Date().toISOString();

  // Ownership first: a hash owned by another club is not this club's to
  // touch, whatever the club asked for.
  const owned = await client.execute({
    sql: 'SELECT * FROM link WHERE hash = ? AND club_code = ? AND competition = ?',
    args: [normalized, club.code, club.competition],
  });
  const row = owned.rows[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const target = rowToLink(row as Record<string, unknown>);

  // A link for a fixture that is over cannot come back to life: it would
  // be a link the club cannot open. The club owns it, so this is a
  // different answer from "no such link".
  if (active && isLinkExpired(target.kind, target.payload)) {
    return { ok: false, reason: 'expired' };
  }

  if (active) {
    await client.execute({
      sql: `UPDATE link
            SET disabled_at = ?, updated_at = ?
            WHERE hash <> ? AND club_code = ? AND competition = ?
              AND kind = ? AND target_key = ? AND disabled_at IS NULL`,
      args: [
        now,
        now,
        normalized,
        club.code,
        club.competition,
        target.kind,
        target.targetKey,
      ],
    });
  }

  const result = await client.execute({
    sql: `UPDATE link
          SET disabled_at = ?, updated_at = ?
          WHERE hash = ? AND club_code = ? AND competition = ?`,
    args: [active ? null : now, now, normalized, club.code, club.competition],
  });

  // `rowsAffected` is 0 when the row does not exist, is owned by another
  // club, or was already in the requested state.
  return result.rowsAffected > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

/**
 * Resolve a hash to its link.
 *
 * Returns null for a malformed, unknown or deactivated hash — the three
 * cases the public route answers with the same not-available page, so a
 * stranger cannot probe which hashes exist. A match link whose fixture is
 * over is a fourth case with the same answer: the link is simply not
 * available any more.
 *
 * STRICTLY READ-ONLY: no row is written here. The resolver is on a public,
 * cacheable path and must not mutate server state.
 */
export async function resolveLink(hash: string): Promise<StoredLink | null> {
  const normalized = normalizeHash(hash);
  if (!normalized) return null;

  // NOT `getStore()`: the schema bootstrap runs DDL, and this is a public
  // read path that must not write anything. The table exists because a link
  // can only be created through `createOrReuseLink`, which bootstraps it.
  const client = await getClient();
  const result = await client.execute({
    sql: 'SELECT * FROM link WHERE hash = ?',
    args: [normalized],
  });

  const row = result.rows[0];
  if (!row) return null;

  const link = rowToLink(row as Record<string, unknown>);
  if (link.disabledAt) return null;

  // A match link is good for the whole of its fixture's day and no longer.
  // The resolver is what makes that true — the store's sweep only keeps the
  // club's list tidy, and a club that never shares again would never run it.
  if (isLinkExpired(link.kind, link.payload)) return null;

  return link;
}
