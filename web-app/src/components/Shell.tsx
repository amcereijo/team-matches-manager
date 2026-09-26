'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { ClubType } from '@/types';
import styles from './Shell.module.css';

const NAV = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/calendario', label: 'Calendario', icon: '📅' },
  { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
];

function isActiveLink(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function crumb(pathname: string): { label: string; title: string } {
  const match = NAV.find((n) => isActiveLink(pathname, n.href));
  return {
    label: 'Team Matches Manager',
    title: match?.label ?? 'Inicio',
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function Shell({
  club,
  competitionName,
  children,
}: {
  club: ClubType;
  competitionName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const c = crumb(pathname);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    startTransition(() => {
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.drawer} aria-label="Main">
        <div className={styles.brand}>
          <div className={styles.brandMark}>T</div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>TMM</span>
            <span className={styles.brandTag}>Team Matches</span>
          </div>
        </div>

        <div className={styles.nav}>
          {NAV.map((item) => {
            const isActive = isActiveLink(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.link} ${isActive ? styles.active : ''}`}
              >
                <span className={styles.linkIcon} aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className={styles.spacer} />

        <div className={styles.userCard}>
          <div className={styles.avatar} aria-hidden>
            {initials(club.name)}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userLabel}>Club</span>
            <span className={styles.userName}>{club.name}</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.logout}
          onClick={logout}
          disabled={pending}
        >
          <span aria-hidden>⎋</span>
          <span>{pending ? 'Saliendo…' : 'Cerrar sesión'}</span>
        </button>
      </nav>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.crumb}>
            <span className={styles.crumbLabel}>{c.label}</span>
            <span className={styles.crumbTitle}>{c.title}</span>
          </div>
          <div className={styles.topbarMeta}>
            <span className={styles.badge}>{competitionName}</span>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
