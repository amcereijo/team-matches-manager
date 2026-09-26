'use client';

import { useEffect, useState } from 'react';
import { getItem, setItem } from '@/services/storage';
import styles from './configuracion.module.css';

const OPTIONS = [
  { value: '/', label: 'Inicio' },
  { value: '/calendario', label: 'Calendario' },
  { value: '/configuracion', label: 'Configuración' },
];

const KEY = 'initialRoute';

export function SettingsForm() {
  const [initialRoute, setInitialRoute] = useState<string>('/');

  useEffect(() => {
    (async () => {
      const value = (await getItem(KEY)) ?? '/';
      setInitialRoute(value);
    })();
  }, []);

  async function storeInitialRoute(value: string) {
    try {
      await setItem(KEY, value);
      setInitialRoute(value);
    } catch (err) {
      console.error('Error storing initial route', err);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>Pantalla inicial</span>
        <span className={styles.cardHint}>
          Elige qué vista se abre al iniciar sesión.
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Mostrar al entrar</span>
        <select
          className={styles.select}
          value={initialRoute}
          onChange={(e) => storeInitialRoute(e.target.value)}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Estado</span>
        <span className={styles.statusOk}>Preferencia guardada</span>
      </div>
    </div>
  );
}
