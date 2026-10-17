import { NextResponse } from 'next/server';
import { getCurrentClub } from '@/lib/sessionServer';
import { getSentForClub, markSent } from '@/lib/server/sentStore';

export async function GET() {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sent = await getSentForClub(club);
  return NextResponse.json({ sent });
}

export async function POST(request: Request) {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('matchKey' in body)) {
    return NextResponse.json({ error: 'matchKey is required' }, { status: 400 });
  }

  const { matchKey } = body as { matchKey: unknown };
  if (typeof matchKey !== 'string' || !matchKey) {
    return NextResponse.json({ error: 'matchKey must be a non-empty string' }, { status: 400 });
  }

  try {
    const { sentAt } = await markSent(club, matchKey);
    return NextResponse.json({ sentAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark sent';
    if (message === 'Match is not ready' || message.startsWith('Invalid matchKey')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
