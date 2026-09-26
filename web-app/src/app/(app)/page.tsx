import Link from 'next/link';
import { COMPETITIONS } from '@/constants/competitions';
import { getCurrentClub } from '@/lib/sessionServer';
import { getMatchesForClub } from '@/services/fmp';
import styles from './main.module.css';

function parseFmpDate(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return null;
  const [hh = '00', mm = '00'] = (time ?? '').split(':');
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function formatLong(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export default async function HomePage() {
  const club = await getCurrentClub();
  if (!club) return null;

  const competition = COMPETITIONS[club.competition];

  let nextMatch: Awaited<ReturnType<typeof getMatchesForClub>>['matches'][number] | null = null;
  let totalMatches = 0;
  try {
    const data = await getMatchesForClub(club.code);
    totalMatches = data.matches.length;
    const sorted = [...data.matches].sort((a, b) => {
      const da = parseFmpDate(a.date, a.time)?.getTime() ?? Infinity;
      const db = parseFmpDate(b.date, b.time)?.getTime() ?? Infinity;
      return da - db;
    });
    nextMatch = sorted[0] ?? null;
  } catch (err) {
    console.error('Home: failed to load matches', err);
  }

  const nextDate = nextMatch ? parseFmpDate(nextMatch.date, nextMatch.time) : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroPrimary}>
          <span className={styles.heroLabel}>Panel del club</span>
          <h1 className={styles.heroTitle}>{club.name}</h1>
          <p className={styles.heroSubtitle}>
            Gestiona tus próximos partidos y comparte la convocatoria con tu equipo en
            un toque.
          </p>
        </div>
        <div className={styles.heroAside}>
          <Link href="/calendario" className={styles.heroAction}>
            <span aria-hidden>📅</span>
            <span>Ver calendario</span>
          </Link>
        </div>
      </section>

      <section className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Competición</span>
          <span className={styles.cardValue} style={{ fontSize: 16 }}>
            {competition.name}
          </span>
          <span className={styles.cardHint}>Temporada activa</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Partidos</span>
          <span className={styles.cardValue}>{totalMatches}</span>
          <span className={styles.cardHint}>
            {totalMatches === 1 ? 'en agenda' : 'en agenda'}
          </span>
        </div>
      </section>

      <section>
        {nextMatch ? (
          <div className={styles.nextMatch}>
            <div>
              <span className={styles.nextLabel}>Próximo partido</span>
              <div className={styles.nextDate}>{formatLong(nextDate)}</div>
              <div className={styles.nextTeams}>
                {nextMatch.local} <span style={{ color: 'var(--text-subtle)' }}>vs</span>{' '}
                {nextMatch.visit}
              </div>
              {nextMatch.league && (
                <div className={styles.nextLeague}>{nextMatch.league}</div>
              )}
            </div>
            <div className={styles.nextMeta}>
              {nextMatch.time && <span>⏰ {nextMatch.time}</span>}
              {nextMatch.location && <span>📍 {nextMatch.location}</span>}
              <Link href="/calendario" className={styles.heroAction}>
                Ver todos
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            No hay partidos en agenda para tu club todavía.
          </div>
        )}
      </section>
    </div>
  );
}
