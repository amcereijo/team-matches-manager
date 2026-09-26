import { getCurrentClub } from '@/lib/sessionServer';
import { getMatchesForClub } from '@/services/fmp';
import { MatchesBoard } from './MatchesBoard';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const club = await getCurrentClub();
  if (!club) return null;

  try {
    const data = await getMatchesForClub(club.code);
    return <MatchesBoard clubName={club.name} matches={data.matches} />;
  } catch (err) {
    console.error(err);
    return <MatchesBoard clubName={club.name} error="No se pudo cargar la agenda" />;
  }
}
