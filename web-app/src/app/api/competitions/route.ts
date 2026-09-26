import { NextResponse } from 'next/server';
import { COMPETITION_LIST } from '@/constants/competitions';

export async function GET() {
  return NextResponse.json({ competitions: COMPETITION_LIST });
}
