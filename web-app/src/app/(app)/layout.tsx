import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { COMPETITIONS } from '@/constants/competitions';
import { getCurrentClub } from '@/lib/sessionServer';
import { Shell } from '@/components/Shell';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const club = await getCurrentClub();
  if (!club) {
    redirect('/login');
  }
  const competition = COMPETITIONS[club.competition];
  return (
    <Shell club={club} competitionName={competition.name}>
      {children}
    </Shell>
  );
}
