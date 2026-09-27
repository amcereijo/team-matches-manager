import type { ClubType } from '@/types';
import { CLUBS_MAP } from './clubs';

export type Credentials = {
  username: string;
  password: string;
};

function parseEnvOverrides(): Record<number, Credentials> {
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
      '[credentials] CLUB_CREDENTIALS_JSON must be a JSON object keyed by numeric club code; ignoring.',
    );
    return {};
  }

  const result: Record<number, Credentials> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) {
      console.warn(
        `[credentials] CLUB_CREDENTIALS_JSON key "${key}" is not a stringified integer; ignoring entry.`,
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
    result[Number(key)] = {
      username: (value as Credentials).username,
      password: (value as Credentials).password,
    };
  }
  return result;
}

const ENV_OVERRIDES: Record<number, Credentials> = parseEnvOverrides();

const BASE_CREDENTIALS: Record<number, Credentials> = {};

export const CLUB_CREDENTIALS: Record<number, Credentials> = {
  ...BASE_CREDENTIALS,
  ...ENV_OVERRIDES,
};

for (const code of Object.keys(CLUBS_MAP)) {
  const num = Number(code);
  if (!CLUB_CREDENTIALS[num]) {
    CLUB_CREDENTIALS[num] = {
      username: `club${num}`,
      password: `club${num}`,
    };
  }
}

/**
 * Look up a club by username/password.
 *
 * Credential sources, in priority order:
 *   1. `process.env.CLUB_CREDENTIALS_JSON` — overrides added at module load.
 *      Shape: { "<clubCode>": { "username": string, "password": string }, ... }.
 *      A malformed env var is rejected (logged once) and treated as empty.
 *   2. Auto-derived defaults — `club<code>` / `club<code>` for every code in CLUBS_MAP.
 */
export function findClubByCredentials(username: string, password: string): ClubType | null {
  const normalized = username.trim().toLowerCase();
  const normalizedPass = password.trim();
  if (!normalized || !normalizedPass) return null;

  for (const codeStr of Object.keys(CLUB_CREDENTIALS)) {
    const code = Number(codeStr);
    const creds = CLUB_CREDENTIALS[code];
    if (
      creds.username.toLowerCase() === normalized &&
      creds.password === normalizedPass
    ) {
      return CLUBS_MAP[code] ?? null;
    }
  }
  return null;
}
