import { ClubType } from '../constants/clubs';
import * as storage from './storage';

export async function getClub(): Promise<ClubType | null> {
  const raw = await storage.getItem('club');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClubType;
  } catch (err) {
    console.error('team.getClub: malformed payload', err);
    return null;
  }
}

export async function getClubName(): Promise<string> {
  const club = await getClub();
  return club ? club.name : 'No team selected';
}

export async function getClubCode(): Promise<number> {
  const club = await getClub();
  return club ? club.code : 0;
}
