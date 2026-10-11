## Context

The web app is a Next.js 14 App Router project with a small server side (`iron-session` auth, competition scraping) and three client-facing routes (`/login`, `/`, `/calendario`, `/configuracion`). See `proposal.md` for the product motivation.

Current relevant state:
- `src/app/layout.tsx` only sets basic `title`/`description` metadata; there is no `viewport` meta tag, theme color, or manifest link.
- `public/` contains only `favicon.png` (≈1.4 MB), so the app has no PWA icons or manifest.
- `next.config.js` is minimal (strict mode only); it does not configure a service worker.
- All pages are server-rendered React Server Components except for interactive pieces like `LoginForm`, `MatchesBoard`, and `SettingsForm`. Any browser-only PWA registration code must live in a client component or in a dedicated service-worker file.

The project already uses TypeScript, npm, and Vercel for deployment, so the PWA tooling should fit into the existing build/publish pipeline without new infrastructure.

## Goals / Non-Goals

**Goals:**
- Make the app installable on Android and iOS home screens via the standard PWA path (manifest + service worker + icons).
- Keep the installed experience full-screen and safe-area aware.
- Provide a usable offline shell and a friendly fallback page when the network is unavailable.
- Expose a non-blocking in-app "Install" affordance for browsers that support it, with instructions for iOS Safari.

**Non-Goals:**
- Building a separate native/hybrid app or publishing to app stores.
- Full offline functionality for dynamic data (matches, fields, teams still require network; the spec only requires the shell to load offline).
- Push notifications or background sync.
- Changing the existing auth, session, or scraping logic.

## Decisions

### 1. Service-worker library: `serwist/next`

**Decision:** Integrate the service worker with `serwist/next` (the successor to `next-pwa`) instead of a hand-written `public/sw.js`.

**Rationale:**
- It is built for the Next.js App Router and can consume the webpack/Vite asset manifest to precache hashed static files automatically.
- It exposes a typed `sw.ts` entry point that lives alongside the app code, so precache revisioning and runtime caching strategies are version-controlled.
- It avoids the manual hazard of maintaining a list of hashed `_next/static/...` URLs.

**Alternatives considered:**
- `@ducanh2912/next-pwa`: widely used but less actively maintained; Serwist is its recommended successor.
- Custom `public/sw.js`: gives full control, but requires us to manually list every precached asset and keep revision hashes in sync with each Next.js build.

### 2. Manifest source: `src/app/manifest.ts`

**Decision:** Implement the manifest as a Next.js `manifest.ts` special file under `src/app/manifest.ts` that exports a `MetadataRoute.Manifest` object.

**Rationale:**
- Type-safe and automatically served at `/manifest.json` with the correct MIME type.
- Easy to reference generated icon paths stored in `public/`.

**Alternatives considered:**
- A static `public/manifest.json`: simpler, but no type checking and slightly harder to keep theme colors in sync with code.

### 3. Icon generation: `sharp`-based build helper

**Decision:** Generate PWA icons from the existing `public/favicon.png` using a small Node script that resizes and adds padding for the maskable variant. The script will be run during development setup and before final asset commits.

**Rationale:**
- Reuses the existing brand asset.
- `sharp` can produce 192×192, 512×512, and maskable (with padding) PNGs deterministically.
- Generated files will be committed under `public/icons/` so the Vercel build does not need native image libraries at build time.

**Alternatives considered:**
- Manual export from a design tool: simple but not reproducible and easy to forget when the logo changes.
- Runtime icon generation in Next.js: adds server-side complexity for a static asset.

### 4. Offline strategy: precache shell + network-first for API/data

**Decision:**
- Precache the static shell for `/login`, `/`, `/calendario`, the offline fallback, and the required JS/CSS bundles.
- Use a network-first strategy for the API routes (`/api/auth/me`, `/api/competitions`, match endpoints) so users always see fresh data when connected.
- Serve the offline fallback for navigations that fail and are not in the cache.

**Rationale:**
- Matches the spec requirement that the shell loads offline while avoiding stale match data.
- Keeps the service worker small and focused; dynamic match data is inherently uncacheable because it changes frequently and depends on the logged-in club.

### 5. In-app install affordance: settings page only

**Decision:** Add the "Install" trigger inside `/configuracion` rather than a persistent banner on every page.

**Rationale:**
- Avoids interrupting the login or calendar workflows.
- The settings page is the natural place for app-level preferences and already contains client-side localStorage logic.
- A banner would introduce new UI chrome in `standalone` mode and risk being dismissed permanently by users.

**Alternatives considered:**
- Floating action button on every page: more discoverable but intrusive.
- Auto-prompt after login: violates the non-blocking requirement and risks prompt dismissal fatigue.

### 6. Display mode: `standalone`

**Decision:** Set the manifest `display` value to `standalone` (not `fullscreen`).

**Rationale:**
- `standalone` gives the app its own icon and window while still exposing the system status bar, which users expect for a utility app.
- `fullscreen` hides status and navigation affordances and can make it hard to escape the app on some Android devices.
- iOS only honors `standalone`-like behavior via `apple-mobile-web-app-capable`, so the two platforms align better with `standalone`.

## Risks / Trade-offs

- **Risk:** Adding a service worker can cache the login page aggressively and make it hard to ship critical auth fixes quickly.  
  **Mitigation:** Configure Serwist to skip waiting and `clientsClaim()` on activate; keep the precache list limited to the shell; use `network-first` for `/api/auth/*`.

- **Risk:** Large icon files slow first install.  
  **Mitigation:** Generate compressed PNGs and use the existing favicon only as the source, not as a served icon.

- **Risk:** iOS Safari does not support `beforeinstallprompt`, so the in-app install control must detect the platform and show fallback instructions.  
  **Mitigation:** Use user-agent/platform hints only to decide UI copy; never gate core functionality on platform.

- **Risk:** The app uses `iron-session` cookies; in `standalone` mode on iOS, session behavior should be the same as Safari, but storage partitioning quirks could theoretically affect logged-in state.  
  **Mitigation:** The login/logout flow remains the server-side source of truth; if a session is lost, the existing auth guard redirects to `/login`, which is precached.

- **Trade-off:** We are committing generated icons to the repo. This adds binary churn but removes a native dependency from the Vercel build pipeline.

## Migration Plan

1. **Local development:**
   - Install the new dependency (`serwist/next` and `sharp` as a dev dependency for icon generation).
   - Run the icon generation script to populate `public/icons/`.
   - Verify `npm run dev` still works and the manifest is reachable at `http://localhost:3000/manifest.json`.
   - Use Chrome DevTools Lighthouse PWA audit to confirm installability.

2. **Build / type-check:**
   - Run `npm run typecheck` and `npm run lint`.
   - Run `npm run build` and inspect the generated service worker in `.next/sw.js` (or Serwist's output path).
   - Test the offline page by disabling the network in DevTools and reloading.

3. **Deploy:**
   - No changes to environment variables or infrastructure.
   - Deploy to Vercel as usual.
   - After deploy, use a real Android device and an iOS device (or their emulators) to verify "Add to Home Screen" works and the installed app launches full-screen.

4. **Rollback:**
   - If the service worker causes unexpected caching issues, the fastest rollback is to remove the `serwist/next` import from `next.config.js` and redeploy. Browsers will unregister the old scope over time; for an immediate fix, increment a cache-busting query parameter on the shell route or ship a new empty service worker.

## Open Questions

- None identified that would change the spec, approach, or task breakdown.
