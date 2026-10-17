import type { CompetitionId } from '@/constants/competitions';
import type { Game } from '@/types';

export function deriveMatchKey(
  competition: CompetitionId,
  clubCode: number,
  match: Game
): string {
  if (match.gameId !== null) {
    return `${competition}:${match.gameId}`;
  }

  const local = (match.local ?? '').trim().toUpperCase();
  const visit = (match.visit ?? '').trim().toUpperCase();
  const date = (match.date ?? '').trim();
  const time = (match.time ?? '').trim();

  return `tuple:${competition}:${clubCode}:${local}:${visit}:${date}:${time}`;
}
