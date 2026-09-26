import { NextResponse } from 'next/server';
import { findClubByCredentials } from '@/constants/credentials';
import { getSession } from '@/lib/sessionServer';

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const username = (body.username ?? '').trim();
  const password = body.password ?? '';

  if (!username || !password) {
    return NextResponse.json(
      { error: 'Usuario y contraseña son obligatorios' },
      { status: 400 },
    );
  }

  const club = findClubByCredentials(username, password);
  if (!club) {
    return NextResponse.json(
      { error: 'Invalid username or password' },
      { status: 401 },
    );
  }

  const session = await getSession();
  session.club = club;
  await session.save();

  return NextResponse.json({ ok: true, club });
}
