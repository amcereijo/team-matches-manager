import type { ClubType } from '@/types';
import { CLUBS_MAP, clubMapKey, type ClubMapKey } from './clubs';

export type Credentials = {
  username: string;
  password: string;
};

function parseEnvOverrides(): Record<ClubMapKey, Credentials> {
  const raw = process.env.CLUB_CREDENTIALS_JSON;
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[credentials] CLUB_CREDENTIALS_JSON is not valid JSON; ignoring. Reason: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return {};
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(
      '[credentials] CLUB_CREDENTIALS_JSON must be a JSON object keyed by "<competition>-<code>"; ignoring.',
    );
    return {};
  }

  const result: Record<ClubMapKey, Credentials> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^(FMP|FGP)-\d+$/.test(key)) {
      console.warn(
        `[credentials] CLUB_CREDENTIALS_JSON key "${key}" is not "<competition>-<code>" (e.g. "FMP-411"); ignoring entry.`,
      );
      continue;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as Credentials).username !== 'string' ||
      typeof (value as Credentials).password !== 'string' ||
      !(value as Credentials).username ||
      !(value as Credentials).password
    ) {
      console.warn(
        `[credentials] CLUB_CREDENTIALS_JSON entry for "${key}" must be {"username": string, "password": string} with both non-empty; ignoring entry.`,
      );
      continue;
    }
    if (!(key in CLUBS_MAP)) {
      console.warn(
        `[credentials] CLUB_CREDENTIALS_JSON override for "${key}" has no matching club in CLUBS_MAP; ignoring entry.`,
      );
      continue;
    }
    result[key as ClubMapKey] = {
      username: (value as Credentials).username,
      password: (value as Credentials).password,
    };
  }
  return result;
}

const ENV_OVERRIDES: Record<ClubMapKey, Credentials> = parseEnvOverrides();

const BASE_CREDENTIALS: Record<ClubMapKey, Credentials> = {};

export const CLUB_CREDENTIALS: Record<ClubMapKey, Credentials> = {
  ...BASE_CREDENTIALS,
  ...ENV_OVERRIDES,
};

for (const club of Object.values(CLUBS_MAP)) {
  const key = clubMapKey(club.competition, club.code);
  if (!CLUB_CREDENTIALS[key]) {
    CLUB_CREDENTIALS[key] = {
      username: `club-${club.competition}-${club.code}`,
      password: `club-${club.competition}-${club.code}`,
    };
  }
}

/**
 * Look up a club by username/password.
 *
 * Credential sources, in priority order:
 *   1. `process.env.CLUB_CREDENTIALS_JSON` — overrides added at module load.
 *      Shape: { "<competition>-<code>": { "username": string, "password": string }, ... }.
 *      A malformed env var is rejected (logged once) and treated as empty.
 *   2. Auto-derived defaults — `club-<competition>-<code>` for every club in CLUBS_MAP
 *      (e.g. `club-FMP-411`, `club-FGP-411`).
 */
export function findClubByCredentials(username: string, password: string): ClubType | null {
  const normalized = username.trim().toLowerCase();
  const normalizedPass = password.trim();
  if (!normalized || !normalizedPass) return null;

  for (const key of Object.keys(CLUB_CREDENTIALS) as ClubMapKey[]) {
    const creds = CLUB_CREDENTIALS[key];
    if (
      creds.username.toLowerCase() === normalized &&
      creds.password === normalizedPass
    ) {
      return CLUBS_MAP[key] ?? null;
    }
  }
  return null;
}
