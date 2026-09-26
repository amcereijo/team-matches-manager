import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function getCurrentClub() {
  const session = await getSession();
  return session.club ?? null;
}
