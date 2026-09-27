## Purpose

Lets web and mobile clients authenticate as a club without any credential living in source. The source of truth is a single Vercel env var; both clients authenticate through one server endpoint, so a rotation only has to happen in one place.

## ADDED Requirements

### Requirement: Club credentials are read from a Vercel env var at runtime
The system MUST read club credential overrides from the `CLUB_CREDENTIALS_JSON` env var. The value MUST be a JSON object whose keys are stringified numeric club codes and whose values are objects of the form `{ "username": string, "password": string }`. Other shapes (array, non-numeric keys, missing `username`/`password`, non-string values) MUST be rejected; on any parse or validation failure the system MUST treat the env var as empty (fail closed: no override applies) and MUST log a single warning at startup identifying that the value was rejected.

#### Scenario: Valid env var is parsed at startup
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `{"411":{"username":"tiso","password":"x"}}`
- **THEN** the system accepts club code 411 with username `tiso` and password `x` and ignores any other value

#### Scenario: Malformed env var fails closed
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `not-json`
- **THEN** the system behaves as if the env var is empty, no override applies, and a single startup warning identifying the rejection is logged

#### Scenario: Env var with wrong shape fails closed
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `["a","b"]`
- **THEN** the system behaves as if the env var is empty and a single startup warning identifying the rejection is logged

#### Scenario: Missing env var
- **WHEN** `CLUB_CREDENTIALS_JSON` is not set
- **THEN** the system behaves as if the env var is empty and no warning is logged

### Requirement: Auto-derived default credentials continue to work
For any club code not present in `CLUB_CREDENTIALS_JSON`, the system MUST accept the historically implicit default pair `club<code>` / `club<code>`. Removing the env var MUST NOT change which clubs can log in.

#### Scenario: Club with no override still logs in
- **WHEN** `CLUB_CREDENTIALS_JSON` is unset and a user submits `club332` / `club332`
- **THEN** login succeeds for club code 332

#### Scenario: Env override beats default
- **WHEN** `CLUB_CREDENTIALS_JSON` contains `{ "332": { "username": "alcala", "password": "secret" } }`
- **THEN** `club332` / `club332` is rejected and `alcala` / `secret` is accepted

### Requirement: Single login endpoint for all clients
The web app and the mobile app MUST both authenticate through `POST /api/auth/login` on the web app. No client MAY compare credentials locally or carry a credentials secret in its bundle.

#### Scenario: Web client calls login endpoint
- **WHEN** a user submits login credentials in the web app
- **THEN** the web client posts `username` and `password` to `/api/auth/login` and no credential comparison happens in the browser bundle

#### Scenario: Mobile client calls login endpoint
- **WHEN** a user submits login credentials in the mobile app
- **THEN** the mobile client posts `username` and `password` to `${API_BASE}/auth/login` on the web app, treats any `200` as success, and sets the same mobile session flag it sets today; non-`200` is treated as failure and the flag is not set

### Requirement: No credentials in source or bundle
No file under version control may contain literal club credentials. The hardcoded `tiso/ttiso`-style override table in `web-app/src/constants/credentials.ts` MUST be removed, and the `USER`/`PASSWORD`/`TEAM` constants in `client-app/components/login-screen/LoginScreen.tsx` MUST be removed.

#### Scenario: Source grep finds no plaintext credentials
- **WHEN** `rg "password"` is run against the repository excluding test fixtures
- **THEN** no match exists in any file under `web-app/src/` or `client-app/`

### Requirement: Login endpoint responds in a way both clients can consume
A successful login MUST return JSON containing `ok: true` and the club object. A failed login MUST return a 4xx status with a JSON body containing an `error` string. No internal secret (env var contents, hash of password, full env-var text) is ever returned in any response.

#### Scenario: Successful login returns club
- **WHEN** valid credentials are posted
- **THEN** the response is `200` with `{ ok: true, club: <ClubType> }`

#### Scenario: Failed login returns error
- **WHEN** invalid credentials are posted
- **THEN** the response is `401` with `{ error: "Invalid username or password" }` and the body contains no other fields

### Requirement: Local development supports the new env var
Developers running the web app locally MUST be able to set `CLUB_CREDENTIALS_JSON` in `.env.local` (already gitignored) and have it picked up without code changes. A sample value for local dev MUST be documented in the web app README.

#### Scenario: Local .env.local is honored
- **WHEN** a developer sets `CLUB_CREDENTIALS_JSON={"411":{"username":"tiso","password":"tiso"}}` in `web-app/.env.local` and restarts `next dev`
- **THEN** logging in as `tiso` / `tiso` succeeds for club 411
