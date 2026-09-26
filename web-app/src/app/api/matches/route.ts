import { NextResponse } from 'next/server';
import { getCurrentClub } from '@/lib/sessionServer';
import { getMatchesForClub } from '@/services/fmp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getMatchesForClub(club.code);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Failed to fetch matches', err);
    return NextResponse.json(
      { error: 'No se pudo cargar la agenda' },
      { status: 502 },
    );
  }
}
