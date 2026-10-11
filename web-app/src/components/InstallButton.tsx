'use client';

import { useEffect, useState } from 'react';
import styles from './InstallButton.module.css';

export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as typeof window.navigator & { standalone?: boolean }).standalone === true;
    setIsIOS(iosDevice);
    setInstalled(isStandalone);

    const handler = (e: Event) => {
      const beforeInstall = e as BeforeInstallPromptEvent;
      beforeInstall.preventDefault();
      setPrompt(beforeInstall);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (installed) {
    return null;
  }

  async function handleInstall() {
    if (isIOS) {
      setShowIOS(true);
      return;
    }
    if (prompt) {
      await prompt.prompt();
      setPrompt(null);
    }
  }

  return (
    <div className={styles.installCard}>
      {!showIOS ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={!isIOS && !prompt}
          className={styles.installButton}
        >
          <span aria-hidden>📲</span>
          <span>Instalar app</span>
        </button>
      ) : (
        <div className={styles.iosInstructions} role="dialog" aria-label="Cómo instalar en iOS">
          <p>
            Para añadir TMM a tu pantalla de inicio en iOS:
          </p>
          <ol>
            <li>Pulsa el botón <strong>Compartir</strong> en la barra de Safari.</li>
            <li>Selecciona <strong>Añadir a la pantalla de inicio</strong>.</li>
          </ol>
          <button
            type="button"
            onClick={() => setShowIOS(false)}
            className={styles.dismissButton}
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
