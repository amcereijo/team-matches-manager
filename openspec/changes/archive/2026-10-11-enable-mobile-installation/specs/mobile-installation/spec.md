## Purpose

Defines the Progressive Web App behavior that lets users install the Team Matches Manager web app on Android and iOS home screens, launch it in a standalone/full-screen mode, and continue using cached pages when the device is offline or has an unreliable connection.

## ADDED Requirements

### Requirement: The app serves a valid web app manifest
The system MUST serve a web app manifest at `/manifest.json` (or `/manifest.webmanifest`) with at least `name`, `short_name`, `start_url`, `display`, `background_color`, `theme_color`, and `icons`. The `start_url` MUST point to `/login` so unauthenticated users land on the login screen and authenticated users are redirected by the existing auth guard. The `display` value MUST be `standalone` or `fullscreen`.

#### Scenario: Browser requests the manifest
- **WHEN** a browser requests `GET /manifest.json`
- **THEN** the response is valid JSON with `Content-Type: application/manifest+json`, contains the required fields, and references icons at the advertised paths

#### Scenario: Manifest links are present in the root layout
- **WHEN** any page in the app is rendered
- **THEN** the HTML `<head>` contains a `<link rel="manifest" href="/manifest.json">` tag and `<meta name="theme-color" content="...">` matching the manifest theme color

### Requirement: PWA icons are provided in the required sizes
The system MUST expose PNG (or maskable/adaptive) icons in the sizes required by major platforms: at minimum 192×192 and 512×512. A maskable icon variant MUST be provided so Android adaptive launchers do not clip the artwork. The icon paths referenced in the manifest MUST be publicly reachable under `/`.

#### Scenario: Manifest references reachable icons
- **WHEN** the manifest is fetched
- **THEN** every `icons` entry resolves to an existing file under `public/` and the 192×192 and 512×512 sizes are present

#### Scenario: Android adaptive launcher uses the maskable icon
- **WHEN** the manifest includes an icon with `purpose: "maskable"`
- **THEN** the icon has enough padding and the system can crop it to any adaptive shape without clipping the logo

### Requirement: A service worker registers on first load and precaches the app shell
The system MUST register a service worker whose scope is `/`. On install, the service worker MUST precache the static shell assets required for first paint of `/login`, `/`, `/calendario`, and the offline fallback page. The service worker MUST activate and take control of clients on first installation.

#### Scenario: First visit registers the service worker
- **WHEN** a user loads the app in a supported browser for the first time
- **THEN** the browser installs a service worker for scope `/`, no unhandled errors are thrown, and `navigator.serviceWorker.controller` becomes defined after activation

#### Scenario: Cached shell loads while offline
- **WHEN** the user has previously loaded the app and then disables the network
- **THEN** navigating to a precached route still renders the app shell and does not show the browser's default offline dinosaur

### Requirement: An offline fallback page is shown for uncached pages
When a navigation request fails and the requested page is not in the cache, the service worker MUST respond with a dedicated offline fallback page that explains the offline state and offers a retry action. The fallback page MUST reuse the app's base styles so it does not look like a broken browser error.

#### Scenario: Uncached route while offline serves fallback
- **WHEN** the user is offline and requests a page that was never precached (for example `/configuracion` if it is not in the precache list)
- **THEN** the service worker returns the offline fallback page with a "Retry" button and HTTP status 200

### Requirement: The root layout includes platform-specific PWA metadata
The system MUST emit the `<meta>` and `<link>` tags needed by iOS/Safari and other platforms to treat the page as an installable web app. This includes `viewport`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and a `theme-color` meta tag.

#### Scenario: iOS Safari detects PWA metadata
- **WHEN** the HTML for any page is rendered
- **THEN** the `<head>` contains `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, at least one `apple-touch-icon` link, and a `theme-color` meta tag

### Requirement: The installed app renders correctly in standalone display mode
The installed app MUST use the full viewport without browser UI. CSS MUST account for display cutouts and safe areas using `env(safe-area-inset-*)` so content is not hidden behind notches, status bars, or home indicators. Touch targets for primary actions MUST be at least 48×48 CSS pixels.

#### Scenario: Standalone launch on a notched phone
- **WHEN** the app is launched from the home screen on a device with a display cutout
- **THEN** all page content is visible within the safe area and no interactive element is obscured by the status bar or home indicator

#### Scenario: Primary buttons are easy to tap
- **WHEN** a user views a page with primary actions (for example the login button or a match "Enviar" button)
- **THEN** each touch target has a width and height of at least 48×48 CSS pixels

### Requirement: Users can trigger installation from inside the app
The system MUST expose an in-app control that triggers the browser's native install prompt on platforms that support `beforeinstallprompt`. On platforms without that event (for example iOS Safari), the control MUST fall back to showing platform-specific instructions for "Add to Home Screen". The install prompt MUST NOT block core functionality if the user dismisses it.

#### Scenario: Android Chrome shows native install prompt
- **WHEN** the user clicks the in-app "Install" button on Android Chrome and the browser has fired `beforeinstallprompt`
- **THEN** the deferred prompt is shown and, if the user accepts, the app is added to the home screen

#### Scenario: iOS Safari shows fallback instructions
- **WHEN** the user clicks the in-app "Install" button on iOS Safari
- **THEN** the app shows concise instructions (for example a modal or toast) explaining how to use the Share sheet "Add to Home Screen" option

#### Scenario: Install prompt is non-blocking
- **WHEN** the install prompt or fallback UI is visible
- **THEN** the user can continue using the login, calendar, and settings pages without interacting with it
