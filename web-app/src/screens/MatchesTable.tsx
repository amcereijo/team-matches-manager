import { useEffect, useState } from 'react';
import { Game, getMatches } from '../services/fmp';
import { getClubCode } from '../services/team';
import { openWhatsapp } from '../services/whatsapp';
import styles from './MatchesTable.module.css';

function formatDate(date?: string | null, time?: string | null): string {
  if (!date || !time) return '';

  const [day, month, year] = date.split('/');
  const [hour, minute] = time.split(':');
  const stringDate = `${year}-${month}-${day}T${hour}:${minute}:00`;

  const dateObj = new Date(stringDate);
  if (isNaN(dateObj.getTime())) {
    console.error('Invalid date');
    return '';
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    day: '2-digit',
  };
  return dateObj.toLocaleDateString('es-ES', options);
}

function dateBlock(date: string | null, time: string | null) {
  const formatted = formatDate(date, time);
  if (formatted) {
    return <span className={styles.team}>{formatted}</span>;
  }
  return <span className={styles.teamNoDate}>Sin fecha y hora</span>;
}

function MatchRow({ index, data }: { index: number; data: Game }) {
  const isEven = index % 2 === 0;
  return (
    <div
      className={styles.matchRow}
      style={isEven ? { backgroundColor: '#F7F6E7' } : undefined}
    >
      <div className={styles.team}>
        {data.league} - {dateBlock(data.date, data.time)}
      </div>
      <div>{`${data.local ?? ''} vs ${data.visit ?? ''}`}</div>
      <div>{`Pista: ${data.location ?? ''}`}</div>
      <button
        type="button"
        className={styles.sendWhatsButton}
        onClick={() => openWhatsapp(data)}
      >
        <span aria-hidden>📱</span>
        <span style={{ marginLeft: 4, color: '#fff' }}>Enviar</span>
      </button>
    </div>
  );
}

export default function MatchesTable() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const code = await getClubCode();
        const data = await getMatches(code);
        if (!cancelled) setGames(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setGames([]);
          setError('No se pudo cargar la agenda');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.table}>
      {games === null && (
        <div className={styles.loading}>
          <div className={styles.spinner} aria-hidden />
          <span>Cargando próximos partidos...</span>
        </div>
      )}

      {games !== null && error && (
        <div className={styles.noMatches}>{error}</div>
      )}

      {games !== null && !error && games.length === 0 && (
        <div className={styles.noMatches}>No hay próximos partidos</div>
      )}

      {games !== null && !error && games.length > 0 && (
        games.map((row, i) => <MatchRow key={i} index={i} data={row} />)
      )}
    </div>
  );
}
