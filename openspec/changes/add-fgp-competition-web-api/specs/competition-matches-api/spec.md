## Purpose

The competition-matches-api capability exposes server-side endpoints that proxy the public sidgad competition agenda and return a normalized list of upcoming matches, teams, and fields. It lets the web app (and any future client) fetch FMP and FGP matches through one contract instead of scraping the upstream HTML directly.

## ADDED Requirements

### Requirement: List supported competitions
The system SHALL expose `GET /api/competitions` and return a JSON array of the competitions the backend knows how to fetch. Each item MUST contain at least the fields `id` (a stable string, e.g. `"FMP"`, `"FGP"`) and `name` (a human-readable federation name).

#### Scenario: FMP and FGP both registered
- **WHEN** a client calls `GET /api/competitions` after the change is deployed
- **THEN** the response body is a non-empty JSON array that contains items with `id` equal to `"FMP"` and `id` equal to `"FGP"`, each with a non-empty `name`

#### Scenario: No upstream call is required
- **WHEN** the endpoint is called
- **THEN** it returns synchronously from a static catalogue and does not perform any network call to sidgad

### Requirement: Fetch matches for a club in a chosen competition
The system SHALL expose `GET /api/matches?competition=<id>&club=<code>` and return a JSON object with `competition`, `club` (`{ code, name }`), `teams` (array of `{ name }`), `fields` (array of `{ name, map }`), and `matches` (array of `{ league, date, time, local, visit, location, map }`). Items in `matches` SHALL include only those in which `local` or `visit` matches the requested club.

#### Scenario: FMP club 411 (TISO PATIN)
- **WHEN** a client calls `GET /api/matches?competition=FMP&club=411`
- **THEN** the response includes a `competition` value of `"FMP"`, `club.code` equals `411`, `club.name` equals `"TISO PATIN"`, and every entry in `matches` has either `local` or `visit` matching the club's display name (case-insensitive, trailing single-letter suffix such as `" A"` or `" B"` treated as equivalent)

#### Scenario: FGP club 411 (TISO PATIN) is the same club
- **WHEN** a client calls `GET /api/matches?competition=FGP&club=411`
- **THEN** the response includes a `competition` value of `"FGP"`, `club.code` equals `411`, `club.name` equals `"TISO PATIN"`, and the `matches` come from the FGP upstream feed rather than FMP

#### Scenario: Unknown club
- **WHEN** a client calls `GET /api/matches?competition=FMP&club=999999`
- **THEN** the response has HTTP status `404` and a JSON body with a non-empty `message` describing the missing club

#### Scenario: Unknown competition
- **WHEN** a client calls `GET /api/matches?competition=NOPE&club=411`
- **THEN** the response has HTTP status `400` and a JSON body with a non-empty `message` describing the unsupported competition

### Requirement: Upstream payload is per-competition
The system SHALL select the upstream `cliente`, `idm`, and `id_temp` form values from a per-competition configuration so that FMP (`cliente=fmp`, `idm=1`, `id_temp=31`) and FGP (`cliente=fgpatinaxe`, `idm=1`, `id_temp=31`) both succeed against `https://sidgad.cloud/shared/portales_files/agenda_portales.php`.

#### Scenario: FMP request body
- **WHEN** the FMP fetcher prepares its upstream request
- **THEN** it POSTs `multipart/form-data` containing `cliente=fmp`, `idm=1`, `id_temp=31`

#### Scenario: FGP request body
- **WHEN** the FGP fetcher prepares its upstream request
- **THEN** it POSTs `multipart/form-data` containing `cliente=fgpatinaxe`, `idm=1`, `id_temp=31`

### Requirement: HTML row layout is shared
The system SHALL parse every `tr.fila_agenda` row in the upstream HTML using the same column-index convention (league at child node `3`, date at `5`, time at `7`, local team at `11`, visit team at `15`, location at `19`), regardless of the competition.

#### Scenario: FMP and FGP produce the same shape
- **WHEN** the same club code is fetched through FMP and through FGP
- **THEN** the response `matches` items have identical keys (`league`, `date`, `time`, `local`, `visit`, `location`, `map`) and the values are populated from the corresponding cells of each federation's agenda table

### Requirement: Web app no longer talks to sidgad directly
The web app MUST obtain both competitions and matches from the api-app endpoints described above. Browser-originated calls to `https://sidgad.cloud/shared/portales_files/agenda_portales.php` MUST NOT appear in the shipped JavaScript bundle.

#### Scenario: Web bundle does not contain sidgad URLs
- **WHEN** `web-app` is built with `npm run build`
- **THEN** the emitted `dist/` files do not contain the literal string `sidgad.cloud/shared/portales_files/agenda_portales.php`

#### Scenario: Web app reads the api base URL from an env var
- **WHEN** the web app is started with `NEXT_PUBLIC_API_BASE_URL` (or the equivalent public env var) set to a URL
- **THEN** every request to `/api/competitions` and `/api/matches` is sent to that base URL