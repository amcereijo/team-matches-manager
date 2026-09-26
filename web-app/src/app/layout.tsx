import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Matches Manager',
  description: 'Login, browse matches and share via WhatsApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
