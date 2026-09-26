'use client';

import { useEffect, useState } from 'react';
import type { Game } from '@/types';
import { getItem, setItem } from '@/services/storage';
import styles from './calendario.module.css';

const INFO_DISMISS_KEY = 'calendario.infoDismissed';

function pad(n: string): string {
  return n.padStart(2, '0');
}

function parseFmpDate(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return null;
  const [hh = '00', mm = '00'] = (time ?? '').split(':');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function formatMatchDate(date?: string | null, time?: string | null): string {
  const d = parseFmpDate(date, time);
  if (!d) return '';
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    day: '2-digit',
  });
}

function formatDayLabel(date?: string | null): string {
  const d = parseFmpDate(date, null);
  if (!d) return '';
  return d
    .toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' })
    .replace('.', '');
}

function buildWhatsappUrl(game: Game, clubName: string): string {
  const dateStr = formatMatchDate(game.date, game.time);
  let text = '';
  text += `Próximo partido *${dateStr}* a las *${game.time ?? ''}* en ${game.location ?? ''} - ${game.map ?? ''}`;
  text += `\n\n${game.local ?? ''} - ${game.visit ?? ''}`;
  text += '\n\n1.';
  text += '\n\nPorteros:\n1.';
  text += '\n\nDelegado:';
  if ((game.local || '').includes(clubName)) {
    text += '\nAnotador:';
  }
  text += '\n\nNo puede:';
  text += '\n\n';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function hasTime(time?: string | null): boolean {
  if (!time) return false;
  const trimmed = time.trim();
  if (!trimmed) return false;
  // Treat sentinel / placeholder times as "not ready"
  if (/^00:?00$/i.test(trimmed) || /^--:?--$/.test(trimmed)) return false;
  return /\d/.test(trimmed);
}

function isMatchReady(game: Game): boolean {
  return Boolean(game.date) && hasTime(game.time);
}

export function MatchesBoard({
  clubName,
  matches,
  error,
}: {
  clubName: string;
  matches?: Game[];
  error?: string;
}) {
  if (error) {
    return (
      <div className={styles.page}>
        <PageHeader count={0} />
        <div className={styles.error} role="alert">
          <strong>No se pudo cargar la agenda</strong>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!matches) {
    return (
      <div className={styles.page}>
        <PageHeader count={null} />
        <div className={styles.loading}>
          <div className={styles.spinner} aria-hidden />
          <span>Cargando próximos partidos…</span>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader count={0} />
        <div className={styles.noMatches}>
          <span className={styles.noMatchesTitle}>Sin partidos por ahora</span>
          <span className={styles.noMatchesHint}>
            Vuelve más tarde o revisa la configuración.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader count={matches.length} />
      <ShareInfoPanel />
      <div className={styles.table}>
        {matches.map((row, i) => {
          const formatted = formatMatchDate(row.date, row.time);
          const day = formatDayLabel(row.date);
          const time = row.time ?? '';
          const ready = isMatchReady(row);
          const isZebra = i % 2 === 1;
          return (
            <div
              key={`${row.date}-${row.time}-${row.local}-${row.visit}-${i}`}
              className={`${styles.matchRow} ${isZebra ? styles.zebra : ''} ${
                ready ? '' : styles.notReady
              }`}
            >
              <div className={styles.matchMain}>
                <div className={styles.matchTopRow}>
                  {row.league && (
                    <span className={styles.matchLeague}>{row.league}</span>
                  )}
                  {!ready && (
                    <span
                      className={styles.pendingBadge}
                      title="La federación aún no ha confirmado la hora de este partido."
                    >
                      <span aria-hidden>⏳</span>
                      <span>Pendiente</span>
                    </span>
                  )}
                </div>
                <span className={styles.matchTeams}>
                  {row.local ?? '?'} <span style={{ color: 'var(--text-subtle)' }}>vs</span> {row.visit ?? '?'}
                </span>
                <div className={styles.matchMeta}>
                  {day ? (
                    <span title={formatted}>
                      <span aria-hidden>🗓</span>
                      {day}
                    </span>
                  ) : (
                    <span className={styles.matchNoDate}>
                      <span aria-hidden>⏱</span>
                      Sin fecha y hora
                    </span>
                  )}
                  {ready ? (
                    <span>
                      <span aria-hidden>⏰</span>
                      {time}
                    </span>
                  ) : row.date ? (
                    <span className={styles.matchPendingTime}>
                      <span aria-hidden>⏰</span>
                      hora por confirmar
                    </span>
                  ) : null}
                  {row.location && (
                    <span>
                      <span aria-hidden>📍</span>
                      {row.map ? (
                        <a
                          className={styles.locationPill}
                          href={row.map}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.location}
                        </a>
                      ) : (
                        row.location
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.matchActions}>
                <a
                  className={styles.sendWhatsButton}
                  href={buildWhatsappUrl(row, clubName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Compartir ${row.local} vs ${row.visit} por WhatsApp`}
                >
                  <span aria-hidden>📱</span>
                  <span>Enviar</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PageHeader({ count }: { count: number | null }) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>Próximos partidos</h1>
        <p className={styles.pageSubtitle}>
          Partidos agendados por la federación para tu club.
        </p>
      </div>
      {count !== null && (
        <div className={styles.toolbar}>
          <span className={styles.toolbarCount}>{count}</span>
          <span>{count === 1 ? 'partido' : 'partidos'}</span>
        </div>
      )}
    </div>
  );
}

function ShareInfoPanel() {
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await getItem(INFO_DISMISS_KEY);
      setDismissed(raw === 'true');
      setHydrated(true);
    })();
  }, []);

  if (!hydrated || dismissed) return null;

  async function dismiss() {
    await setItem(INFO_DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className={styles.infoPanel} role="region" aria-label="Cómo funciona Enviar">
      <button
        type="button"
        className={styles.infoHeader}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.infoIcon} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <span className={styles.infoHeaderText}>
          <span className={styles.infoTitle}>Cómo funciona “Enviar”</span>
          <span className={styles.infoHint}>
            El comportamiento cambia según el dispositivo.
          </span>
        </span>
        <svg
          className={`${styles.infoChevron} ${open ? styles.open : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className={styles.infoBody}>
          <p className={styles.infoIntro}>
            El botón <strong>Enviar</strong> abre una conversación de WhatsApp
            con el mensaje del partido ya escrito. Necesitas tener WhatsApp
            instalado o usar la versión web.
          </p>

          <div className={styles.infoDevices}>
            <div className={styles.infoDevice}>
              <span className={styles.infoDeviceHeader}>
                <span aria-hidden>📱</span>
                <span>Móvil (Android / iOS)</span>
              </span>
              <span className={styles.infoDeviceBody}>
                Pulsa <strong>Enviar</strong> y la app de WhatsApp se abre con el
                mensaje listo. Solo tienes que elegir el chat del grupo.
                <br />
                <strong>Requisito:</strong> WhatsApp instalado en el teléfono.
              </span>
            </div>

            <div className={styles.infoDevice}>
              <span className={styles.infoDeviceHeader}>
                <span aria-hidden>💻</span>
                <span>Escritorio (Windows / Mac / Linux)</span>
              </span>
              <span className={styles.infoDeviceBody}>
                Pulsa <strong>Enviar</strong> y se abre{' '}
                <strong>web.whatsapp.com</strong> en una pestaña nueva con el
                mensaje precargado. Pega el texto en el grupo correspondiente.
                <br />
                <strong>Requisito:</strong> tener sesión abierta en WhatsApp
                Web o abrir la URL manualmente.
              </span>
            </div>
          </div>

          <button type="button" className={styles.infoDismiss} onClick={dismiss}>
            No volver a mostrar
          </button>
        </div>
      )}
    </div>
  );
}
