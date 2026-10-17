import { getCurrentClub } from '@/lib/sessionServer';
import { getSentForClub } from '@/lib/server/sentStore';
import { getMatchesForClub } from '@/services/competition';
import { MatchesBoard } from './MatchesBoard';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const club = await getCurrentClub();
  if (!club) return null;

  try {
    const data = await getMatchesForClub(club);
    const sent = await getSentForClub(club);
    return (
      <MatchesBoard
        clubName={club.name}
        competition={club.competition}
        clubCode={club.code}
        matches={data.matches}
        initialSent={sent}
      />
    );
  } catch (err) {
    console.error(err);
    return <MatchesBoard clubName={club.name} error="No se pudo cargar la agenda" />;
  }
}
