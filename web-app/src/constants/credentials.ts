import type { ClubType } from '@/types';
import { CLUBS_MAP } from './clubs';

export type Credentials = {
  username: string;
  password: string;
};

const BASE_CREDENTIALS: Record<number, Credentials> = {
  411: { username: 'tiso', password: 'tiso' },
};

export const CLUB_CREDENTIALS: Record<number, Credentials> = { ...BASE_CREDENTIALS };

for (const code of Object.keys(CLUBS_MAP)) {
  const num = Number(code);
  if (!CLUB_CREDENTIALS[num]) {
    CLUB_CREDENTIALS[num] = {
      username: `club${num}`,
      password: `club${num}`,
    };
  }
}

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
