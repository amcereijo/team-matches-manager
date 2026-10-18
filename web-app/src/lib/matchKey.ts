import type { CompetitionId } from '@/constants/competitions';
import type { Game } from '@/types';

export function deriveMatchKey(
  competition: CompetitionId,
  clubCode: number,
  match: Game,
): string {
  // The upstream `param_game` attribute does not contain a unique per-fixture
  // id; its last segment is the competition id shared by many matches. We
  // build a stable key from the match's own codes plus date/time so each
  // fixture in the Calendario gets a distinct identity.
  const localCode = match.localCode ?? '';
  const visitCode = match.visitCode ?? '';
  const date = (match.date ?? '').trim();
  const time = (match.time ?? '').trim();

  if (localCode || visitCode) {
    return `${competition}:${localCode}:${visitCode}:${date}:${time}`;
  }

  // Fallback for rows where param_game is missing entirely.
  const local = (match.local ?? '').trim().toUpperCase();
  const visit = (match.visit ?? '').trim().toUpperCase();
  return `tuple:${competition}:${clubCode}:${local}:${visit}:${date}:${time}`;
}

