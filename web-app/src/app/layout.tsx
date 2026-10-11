import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Team Matches Manager',
  description: 'Login, browse matches and share via WhatsApp',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Team Matches Manager',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="TMM" />
      </head>
      <body>{children}</body>
    </html>
  );
}
