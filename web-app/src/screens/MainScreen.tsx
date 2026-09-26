import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClubType } from '../constants/clubs';
import * as storage from '../services/storage';
import { getClub } from '../services/team';
import styles from './MainScreen.module.css';

export default function MainScreen() {
  const navigate = useNavigate();
  const [club, setClub] = useState<ClubType | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await getClub();
      if (!cancelled) setClub(c);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    await storage.setItem('login', 'false');
    await storage.setItem('club', '');
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.welcome}>Bienvenido</span>
        {club && (
          <>
            <span className={styles.welcome}>, está gestionando el club </span>
            <strong className={styles.team}>{club.name}</strong>
          </>
        )}
      </header>

      <div className={styles.header}>
        <button className={styles.button} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
