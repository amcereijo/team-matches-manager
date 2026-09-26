## Purpose

Provide the team's matches manager as a browser-served, Vercel-deployable web application that mirrors the existing React Native experience: users authenticate, browse upcoming matches for their club, and share a match via WhatsApp from any modern desktop or mobile browser without installing the native app.

## ADDED Requirements

### Requirement: Web app is deployable to Vercel

The system SHALL expose a Vercel-deployable project (Vite + React + TypeScript) at the repository's `web-app/` root, buildable with `npm run build` and serving the production bundle to any browser that navigates to the deployed URL.

#### Scenario: First-time deploy
- **WHEN** a maintainer runs the Vercel project creation flow pointing at the repository root with the project root set to `web-app/`
- **THEN** Vercel detects the Vite framework preset, builds with `npm run build`, and serves the static bundle

#### Scenario: Existing user loads the deployed URL
- **WHEN** a user opens the deployed URL in any modern browser
- **THEN** the login screen is shown within five seconds on a normal broadband connection

### Requirement: Web app reuses the mobile app's user flows

The system SHALL provide the same observable user flows as `client-app/`: club/username/password login, drawer navigation between Inicio, Calendario, and Configuración, an upcoming-matches list, and a "share via WhatsApp" action that opens `https://wa.me/` with a pre-filled message.

#### Scenario: Successful login on the web app
- **WHEN** the user enters a valid club, username, and password on the login screen
- **THEN** the system stores a login flag and the selected club in browser storage and navigates to the Inicio screen

#### Scenario: Failed login on the web app
- **WHEN** the user submits credentials that do not match the configured values
- **THEN** the system displays an error message and remains on the login screen

#### Scenario: User opens Calendario
- **WHEN** a logged-in user navigates to Calendario
- **THEN** the system fetches matches for the user's club, renders the loading state while fetching, and shows either a list of matches or an empty-state message

#### Scenario: User shares a match via WhatsApp
- **WHEN** a logged-in user clicks the WhatsApp share control on a match row
- **THEN** the system opens (in a new tab when on desktop, in the same tab on mobile) a `wa.me/` URL whose body is the configured match message template populated with that match's data

#### Scenario: User changes the initial screen from Configuración
- **WHEN** a logged-in user picks a value in the "Pantalla inicial" picker on Configuración
- **THEN** the system persists the selection in browser storage and reloads (or routes) accordingly so the new value takes effect on the next navigation

#### Scenario: User logs out from Inicio
- **WHEN** a logged-in user clicks the "Cerrar sesión" button on Inicio
- **THEN** the system clears the login flag and the stored club, and returns the user to the login screen

### Requirement: Login state is persisted across reloads in the browser

The system SHALL persist the login flag, the selected club, and the configured initial route in the browser's `localStorage` so that reloading the page (or returning the next day) restores the previous session until the user explicitly logs out.

#### Scenario: Reload while logged in
- **WHEN** a logged-in user reloads the page
- **THEN** the app skips the login screen and renders the user's last selected initial route

#### Scenario: Reload while logged out
- **WHEN** a user who has never logged in (or who has logged out) reloads the page
- **THEN** the app displays the login screen

### Requirement: Web app is visually equivalent to the mobile app's content

The system SHALL render the same text content and labelling (Spanish copy, same club names, same match row layout) as the React Native app. Visual styling MAY adapt (CSS in place of `StyleSheet`) but the information hierarchy per screen SHALL be preserved.

#### Scenario: Calendario screen content matches mobile
- **WHEN** a user views the Calendario screen on the web app
- **THEN** the screen shows, for each match, the league, formatted date and time, local team vs visit team, location, and a WhatsApp send action — in that order

### Requirement: Web app does not modify the mobile codebase

The system SHALL confine all web-app code to the new `web-app/` directory. The existing `client-app/`, `api-app/`, and `deno-api-app/` source trees SHALL remain untouched by this change.

#### Scenario: No cross-folder imports
- **WHEN** a developer inspects the web app's dependency graph
- **THEN** no file under `web-app/` imports a path inside `client-app/`, `api-app/`, or `deno-api-app/`

### Requirement: Web app remains usable on a standalone basis

The system SHALL work without any new backend service. Static constants (clubs list, locations map) and the hardcoded credentials SHALL live inside `web-app/` so the bundle is fully self-contained at deploy time.

#### Scenario: Cold deploy without backend
- **WHEN** the bundle is deployed to Vercel and accessed for the first time
- **THEN** the user can reach the login screen, sign in, and navigate every screen without any server-side component being online
