## Why

The web app is currently only usable inside a browser tab. Coaches and club staff often access it from phones on the field, so it should behave like a first-class mobile app: launchable from the home screen, full-screen, offline-tolerant, and installable through the browser's native "Add to Home Screen" flow. Turning the Next.js app into a Progressive Web App (PWA) delivers this without building or maintaining a separate native app.

## What Changes

- Add a web app manifest (`manifest.json`) with app metadata, theme colors, display mode, and icon set.
- Generate PWA icon sizes from the existing `public/favicon.png` (or a dedicated source asset) and register them in the manifest and HTML `<head>`.
- Register a service worker that precaches the shell and provides an offline fallback page.
- Update the root layout metadata with PWA-related `<meta>` and `<link>` tags (theme-color, viewport, apple-touch-icon, mask-icon, etc.).
- Provide an optional in-app "Install" prompt for supported browsers/devices that do not surface the native install banner automatically.
- Adjust the auth-guarded shell and login page CSS so the installed app renders correctly in `standalone` / `fullscreen` display modes (safe areas, fixed chrome, touch targets).

## Capabilities

### New Capabilities
- `mobile-installation`: Progressive Web App support that lets users install the web app on Android and iOS home screens and use it offline.

### Modified Capabilities
- *(none — existing authentication and match-display requirements do not change)*

## Impact

- `src/app/layout.tsx` and `src/app/globals.css` will gain PWA metadata and safe-area styles.
- New files will be added under `public/` (manifest, icons, offline fallback) and `src/app/sw.ts` or `public/sw.js`.
- A service-worker library such as `serwist` or `@ducanh2912/next-pwa` will be added as a dev/dependency; no runtime changes to login, session, or match APIs.
- Build output will include a generated service worker; Vercel deployment remains unchanged.
