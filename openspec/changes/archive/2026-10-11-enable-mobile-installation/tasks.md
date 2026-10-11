## 1. Setup and dependencies

- [x] 1.1 Install `serwist/next` and `serwist` as runtime dependencies for the service-worker integration.
- [x] 1.2 Install `sharp` as a dev dependency and add a `scripts/generate-pwa-icons.js` helper that resizes `public/favicon.png` into 192×192, 512×512, and maskable variants under `public/icons/`.
- [x] 1.3 Run the icon generation script, verify the output files exist, and commit them.
- [x] 1.4 Add `.next/sw.js` (or Serwist output) and generated icon working files to `.gitignore` if needed, while keeping `public/icons/` tracked.

## 2. Web app manifest and icons

- [x] 2.1 Create `src/app/manifest.ts` exporting a `MetadataRoute.Manifest` object with `name`, `short_name`, `start_url: "/login"`, `display: "standalone"`, `background_color`, `theme_color`, and icon entries pointing to the generated PNGs (including a `purpose: "maskable"` variant).
- [x] 2.2 Verify `GET /manifest.json` returns valid JSON with `Content-Type: application/manifest+json` and that all icon paths resolve to existing files under `public/`.
- [x] 2.3 Update `src/app/layout.tsx` to include the manifest link and a matching `theme-color` meta tag, while preserving the existing `title`/`description` metadata.

## 3. Service worker and offline support

- [x] 3.1 Create `src/app/sw.ts` as the Serwist service-worker entry point, importing `Serwist`, enabling `precacheEntries`, `skipWaiting`, and `clientsClaim`.
- [x] 3.2 Configure `next.config.js` to wrap the Next.js config with `withSerwistNext`, pointing `swSrc` to `src/app/sw.ts` and `swDest` to the standard output path.
- [x] 3.3 Add runtime caching in `src/app/sw.ts` so API routes under `/api/` use `NetworkFirst` and navigations fall back to the offline page when the network and cache both miss.
- [x] 3.4 Create `public/offline.html` (or a dedicated route) as the offline fallback, styled with the app base theme and a "Reintentar" button that reloads the page.
- [x] 3.5 Precache the offline fallback page and the static shell routes (`/login`, `/`, `/calendario`) in the service worker.

## 4. Layout metadata, viewport, and safe-area styling

- [x] 4.1 Add `viewport` metadata to `src/app/layout.tsx` with `width=device-width`, `initial-scale=1`, and `viewport-fit=cover`.
- [x] 4.2 Add iOS/Safari PWA meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and `apple-touch-icon` links.
- [x] 4.3 Update `src/app/globals.css` to include safe-area padding (`env(safe-area-inset-*)`) on the root `html`/`body` and the auth-guarded shell so content is not hidden behind notches or home indicators.
- [x] 4.4 Audit primary touch targets (login button, drawer links, "Enviar" buttons) and ensure they are at least 48×48 CSS pixels.

## 5. In-app install control

- [x] 5.1 Create a small client component (`components/InstallButton.tsx`) that listens for `beforeinstallprompt`, defers it, and calls `prompt()` when the user clicks "Instalar app".
- [x] 5.2 Add iOS Safari fallback behavior in `InstallButton.tsx` that shows a modal/toast with "Añadir a la pantalla de inicio" instructions via the Share sheet.
- [x] 5.3 Place the install control inside `/configuracion` so it is non-blocking and does not appear on login or calendar pages.
- [x] 5.4 Ensure the install prompt/fallback UI can be dismissed without blocking navigation or core page functionality.

## 6. Verification and deployment

- [x] 6.1 Run `npm run typecheck` and `npm run lint`; fix any errors introduced by the new files.
- [x] 6.2 Run `npm run build` and confirm the service worker is generated and the manifest/icons are present in `.next/`.
- [ ] 6.3 Use Chrome DevTools Lighthouse PWA audit to confirm installability, valid manifest, and service-worker registration.
- [ ] 6.4 Test offline behavior by disabling network in DevTools and reloading `/login`, `/`, and an uncached route.
- [ ] 6.5 Deploy to Vercel and verify "Add to Home Screen" on a real Android device and iOS device (or emulator) launches the app in standalone mode.
- [x] 6.6 Update the web app README with a short "PWA / Install" section explaining how to generate icons and how users can install the app.
