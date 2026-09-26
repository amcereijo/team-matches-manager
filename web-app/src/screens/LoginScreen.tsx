import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CLUBS, CLUBS_MAP, ClubType } from '../constants/clubs';
import * as storage from '../services/storage';
import styles from './LoginScreen.module.css';

const USER = 'tiso';
const PASSWORD = 'tiso';
const TEAM_CODE = 411;

export default function LoginScreen() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<ClubType | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (team?.code === TEAM_CODE && username === USER && password === PASSWORD) {
      await storage.setItem('login', 'true');
      await storage.setItem('club', JSON.stringify(team));
      navigate('/');
      return;
    }

    setError(`Invalid username or password for team ${team?.name ?? ''}`);
  };

  return (
    <form className={styles.container} onSubmit={submit}>
      <select
        className={styles.picker}
        value={team?.code ?? 0}
        onChange={(e) => {
          const code = Number(e.target.value);
          if (!code) return;
          setTeam(CLUBS_MAP[code] ?? null);
        }}
      >
        <option value={0}>Selecciona tu club</option>
        {CLUBS.map((club) => (
          <option key={club.code} value={club.code}>
            {club.name}
          </option>
        ))}
      </select>

      <input
        className={styles.input}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="username"
      />

      <input
        className={styles.input}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        autoComplete="current-password"
      />

      <button className={styles.button} type="submit">
        Entrar
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
