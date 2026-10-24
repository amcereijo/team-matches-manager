'use client';

import { useState } from 'react';
import type { LinkView } from '@/lib/shortLink';
import type { Squad } from '@/types';
import styles from './links.module.css';

// The club's short links: what each one points at, its short URL, and the
// actions that change its state.
//
// Every action goes through the session-protected management API and the
// component re-renders from the response — no full page reload, so the club
// never loses their place.

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LinkList({
  initialLinks,
  squads,
}: {
  initialLinks: LinkView[];
  squads: Squad[];
}) {
  const [links, setLinks] = useState<LinkView[]>(initialLinks);
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [squad, setSquad] = useState('');
  const [league, setLeague] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // The league is part of a squad's identity: the same team name exists in
  // several leagues, and only the pair names one team. The picker therefore
  // asks for both, and the team suggestions are narrowed to the league that
  // was picked.
  const leagues = Array.from(
    new Set(squads.map((s) => s.league).filter((l): l is string => Boolean(l))),
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const availableSquads = league
    ? squads.filter((s) => s.league === league)
    : squads;
  const squadNames = Array.from(new Set(availableSquads.map((s) => s.name)));

  async function copyLink(link: LinkView) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedHash(link.hash);
      window.setTimeout(() => setCopiedHash(null), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The
      // URL is on the page either way, so the club can copy it by hand.
      setCopiedHash(null);
    }
  }

  async function setActive(link: LinkView, active: boolean) {
    setBusyHash(link.hash);
    try {
      const res = await fetch('/api/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: link.hash, active }),
      });
      if (!res.ok) return;
      setLinks((prev) =>
        prev.map((item) =>
          item.hash === link.hash
            ? { ...item, active, updatedAt: new Date().toISOString() }
            : item,
        ),
      );
    } finally {
      setBusyHash(null);
    }
  }

  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    const value = squad.trim();
    if (!value) return;

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: [
            { kind: 'team_calendar', squad: value, league: league.trim() || null },
          ],
        }),
      });
      if (!res.ok) {
        setCreateError('No se pudo crear el enlace');
        return;
      }
      const data = (await res.json()) as { links?: LinkView[] };
      const created = data.links?.[0];
      if (created) {
        setLinks((prev) => [created, ...prev]);
        setSquad('');
        setLeague('');
      }
    } catch {
      setCreateError('No se pudo crear el enlace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Enlaces cortos</h1>
          <p className={styles.pageSubtitle}>
            Direcciones cortas y revocables para compartir con el equipo. Se guardan
            en esta cuenta y puedes desactivarlas cuando quieras. Los enlaces de
            partido caducan el día después del partido.
          </p>
        </div>
      </header>

      <section className={styles.create}>
        <form onSubmit={createLink} className={styles.createForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Liga</span>
            <select
              className={styles.input}
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                setSquad('');
              }}
            >
              <option value="">Sin liga (todas)</option>
              {leagues.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Nuevo enlace de calendario de equipo</span>
            <input
              className={styles.input}
              list="link-squads"
              value={squad}
              placeholder="HL NOROESTE A"
              onChange={(e) => setSquad(e.target.value)}
            />
            <datalist id="link-squads">
              {squadNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <span className={styles.fieldHint}>
              El enlace muestra solo los partidos de ese equipo
              {league ? ` en ${league}` : ''}.
            </span>
          </label>
          <button type="submit" className={styles.primaryButton} disabled={creating || !squad.trim()}>
            <span aria-hidden>🔗</span>
            <span>{creating ? 'Creando…' : 'Crear enlace'}</span>
          </button>
        </form>
        {createError && (
          <p className={styles.error} role="alert">
            {createError}
          </p>
        )}
      </section>

      {links.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Todavía no hay enlaces</p>
          <p className={styles.emptyHint}>
            Crea uno arriba, o comparte un partido desde el calendario: el enlace
            corto se crea solo.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {links.map((link) => {
            // An expired match link cannot be opened any more, whatever the
            // stored state says: the fixture's day is over. It is neither
            // active nor something the club deactivated, so it gets its own
            // state — and no re-activation, because there is nothing to bring
            // back to life.
            const expired = link.expired;
            const active = link.active && !expired;

            return (
              <li
                key={link.hash}
                className={`${styles.item} ${active ? '' : styles.itemInactive}`}
              >
                <div className={styles.itemHead}>
                  <span className={styles.itemTitle}>{link.description}</span>
                  <span
                    className={
                      expired
                        ? styles.badgeExpired
                        : active
                          ? styles.badgeActive
                          : styles.badgeInactive
                    }
                  >
                    {expired ? 'Expirado' : active ? 'Activo' : 'Desactivado'}
                  </span>
                </div>

                <code className={styles.url}>{link.url}</code>

                {link.target && <p className={styles.target}>Apunta a {link.target}</p>}

                <p className={styles.meta}>
                  Creado el {formatTimestamp(link.createdAt)} · actualizado el{' '}
                  {formatTimestamp(link.updatedAt)}
                </p>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => copyLink(link)}
                  >
                    <span aria-hidden>📋</span>
                    <span>{copiedHash === link.hash ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  {active ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busyHash === link.hash}
                      onClick={() => setActive(link, false)}
                    >
                      <span aria-hidden>🚫</span>
                      <span>Desactivar</span>
                    </button>
                  ) : (
                    !expired && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busyHash === link.hash}
                        onClick={() => setActive(link, true)}
                      >
                        <span aria-hidden>✅</span>
                        <span>Reactivar</span>
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.footnote}>
        Un enlace de partido deja de funcionar cuando termina el día del
        partido: ese mismo día sigue siendo válido, y al día siguiente ya no.
        Un enlace desactivado puede seguir funcionando hasta 5 minutos, porque
        las páginas y las redirecciones se guardan en caché. Pasado ese plazo,
        deja de abrirse.
      </p>
    </div>
  );
}
