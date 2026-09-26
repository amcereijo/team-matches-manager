import { useEffect, useState } from 'react';
import * as storage from '../services/storage';
import styles from './SettingsScreen.module.css';

const OPTIONS = [
  { value: '/inicio', label: 'Inicio' },
  { value: '/calendario', label: 'Calendario' },
  { value: '/configuracion', label: 'Configuración' },
];

export default function SettingsScreen() {
  const [initialRoute, setInitialRoute] = useState<string>('/inicio');

  useEffect(() => {
    (async () => {
      const value = (await storage.getItem('initialRoute')) ?? '/inicio';
      setInitialRoute(value);
    })();
  }, []);

  const storeInitialRoute = async (value: string) => {
    try {
      await storage.setItem('initialRoute', value);
      setInitialRoute(value);
    } catch (err) {
      console.error('Error storing initial route', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.column}>
        <div className={styles.row}>
          <span className={styles.title}>Pantalla inicial:</span>
          <select
            className={styles.picker}
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
      </div>
      <div className={styles.column} />
    </div>
  );
}
