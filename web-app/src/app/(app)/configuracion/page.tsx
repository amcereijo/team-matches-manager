import { SettingsForm } from './SettingsForm';
import styles from './configuracion.module.css';

export default function ConfiguracionPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Configuración</h1>
          <p className={styles.pageSubtitle}>
            Preferencias de la aplicación guardadas en este navegador.
          </p>
        </div>
      </div>
      <SettingsForm />
    </div>
  );
}
