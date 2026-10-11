## MODIFIED Requirements

### Requirement: Club credentials are read from a Vercel env var at runtime
The system MUST read club credential overrides from the `CLUB_CREDENTIALS_JSON` env var. The value MUST be a JSON object whose keys are stringified `<competition>-<code>` pairs (e.g. `"FMP-411"`, `"FGP-411"`) and whose values are objects of the form `{ "username": string, "password": string }`. Keys must match an existing club in `CLUBS_MAP` after composite keying. Other shapes (array, non-`FMP|FGP-<digits>` keys, missing `username`/`password`, non-string values) MUST be rejected; on any parse or validation failure the system MUST treat the env var as empty (fail closed: no override applies) and MUST log a single warning at startup identifying that the value was rejected.

#### Scenario: Valid env var is parsed at startup
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `{"FMP-411":{"username":"tiso","password":"x"}}`
- **THEN** the system accepts FMP club code 411 with username `tiso` and password `x` and ignores any other value

#### Scenario: Malformed env var fails closed
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `not-json`
- **THEN** the system behaves as if the env var is empty, no override applies, and a single startup warning identifying the rejection is logged

#### Scenario: Env var with wrong shape fails closed
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `["a","b"]`
- **THEN** the system behaves as if the env var is empty and a single startup warning identifying the rejection is logged

#### Scenario: Numeric-only key is rejected
- **WHEN** `CLUB_CREDENTIALS_JSON` is set to `{"411":{"username":"tiso","password":"tiso"}}`
- **THEN** the system behaves as if the env var is empty and a single startup warning identifying that the key is not `<competition>-<code>` is logged

#### Scenario: Missing env var
- **WHEN** `CLUB_CREDENTIALS_JSON` is not set
- **THEN** the system behaves as if the env var is empty and no warning is logged

### Requirement: Auto-derived default credentials continue to work
For any club code not present in `CLUB_CREDENTIALS_JSON`, the system MUST accept the auto-derived default pair `club-<competition>-<code>` / `club-<competition>-<code>` (e.g. `club-FMP-411`, `club-FGP-411`). Removing the env var MUST NOT change which clubs can log in. The auto-derived defaults MUST be unique across competitions even when club codes are shared.

#### Scenario: Club with no override still logs in
- **WHEN** `CLUB_CREDENTIALS_JSON` is unset and a user submits `club-FMP-332` / `club-FMP-332`
- **THEN** login succeeds for FMP club code 332

#### Scenario: FGP club with no override still logs in
- **WHEN** `CLUB_CREDENTIALS_JSON` is unset and a user submits `club-FGP-162` / `club-FGP-162`
- **THEN** login succeeds for FGP club code 162

#### Scenario: Shared code clubs log in with different defaults
- **WHEN** `CLUB_CREDENTIALS_JSON` is unset and club code 411 exists in both FMP (`TISO PATIN`) and FGP (`RAPOSOS`)
- **THEN** `club-FMP-411` / `club-FMP-411` logs in as the FMP club and `club-FGP-411` / `club-FGP-411` logs in as the FGP club, with no cross-collision

#### Scenario: Env override beats default
- **WHEN** `CLUB_CREDENTIALS_JSON` contains `{ "FMP-332": { "username": "alcala", "password": "secret" } }`
- **THEN** `club-FMP-332` / `club-FMP-332` is rejected and `alcala` / `secret` is accepted