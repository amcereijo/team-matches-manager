import { NextResponse } from 'next/server';
import { getCurrentClub } from '@/lib/sessionServer';

export async function GET() {
  const club = await getCurrentClub();
  return NextResponse.json({ club });
}
