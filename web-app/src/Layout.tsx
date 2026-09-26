import { Navigate, NavLink, Outlet } from 'react-router-dom';
import styles from './Layout.module.css';

function isLoggedIn(): boolean {
  try {
    return window.localStorage.getItem('login') === 'true';
  } catch {
    return false;
  }
}

export default function Layout() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  return (
    <div className={styles.shell}>
      <nav className={styles.drawer} aria-label="Main">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
          Inicio
        </NavLink>
        <NavLink
          to="/calendario"
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
          Calendario
        </NavLink>
        <NavLink
          to="/configuracion"
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
          Configuración
        </NavLink>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
