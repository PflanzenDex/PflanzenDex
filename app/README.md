# PflanzenDex app

Monorepo (npm workspaces) with four packages. Every task runs through the `Makefile` in the repo root (`make help`). Tooling and docs are English; domain code uses the German glossary terms from the specs (`konto`, `exemplar`, `pruefvorgang`, …).

| Package         | Contents                                        | Rule                                                                                                                                        |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | Domain logic, pure functions                    | imports nothing from API, web, database, file system or network (AB-1); every directory with code has an `index.ts`                         |
| `packages/db`   | PostgreSQL schema, migrations, tenant isolation | meant for `api` only; `core` and `web` never import it; every user-owned table carries `konto_id` and calls `mandantenschutz()` (FR-ACC-02) |
| `packages/api`  | HTTP API (Hono)                                 | calls `core` only through `@pflanzendex/core` (AB-2)                                                                                        |
| `packages/web`  | Mobile-first PWA (React, Vite)                  | calls `core` only through `@pflanzendex/core` (AB-2)                                                                                        |

## Modules (ADR 0003, variant A)

Inside each layer package the code is cut into module folders with the same names: `src/<module>/` in `core`, `db`, `api` and `web`. Each module has an `index.ts` as its public interface; other modules and the layer root import only from there. Test files sit next to the code. Migrations stay one global sequence (`packages/db/migrations/`, files `0001`-`0004` keep their names).

| Module    | Contents                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kern`    | Operation engine, `Ergebnis`, error codes, validation, ports (`core/src/kern`, with `meta`); tenant access, migrations, idempotency (`db/src/kern`); error mapping (`api/src/kern`) |
| `konto`   | Sign-in and account (`core/src/konto`, `db/src/konto`, `api/src/konto` incl. `auth/`, `web/src/konto`); tables `kontodaten`, `konto_rolle`                                          |
| `katalog` | Review status (`core/src/katalog`, `db/src/katalog`); table `pruefvorgang`                                                                                                          |
| `licht`   | Light zones and locations (`core/src/licht`, `db/src/licht`, `api/src/licht`, `web/src/licht`); tables `lichtzone`, `standort`                                                      |
| `bestand` | Exemplare (`core/src/bestand`, `db/src/bestand`, `api/src/bestand`, `web/src/bestand`); table `exemplar`; depends on `kern`, `katalog`, `licht`                                     |
| `pflege`  | Care phases (`core/src/pflege`, `api/src/pflege`, `web/src/pflege`); no table yet (derived live); depends on `kern`, `katalog`, `licht`, `bestand`, `monitoring` (registered)       |

```bash
make setup   # install dependencies
make dev     # start API (port 3000) and web (Vite)
make ci      # all gates: lint, types, boundaries, format, tests, build
```

- **Node:** version 24 (`.nvmrc`). Vitest 5 does not officially support odd Node versions (e.g. 25).
- **TypeScript 6.0.x** is pinned on purpose: `typescript-eslint` does not support TypeScript 7 yet (peer range `<6.1`).
- **Boundary check:** `npm run boundaries` (script and tests in `scripts/`); messages name the rule ID, file and line. Module rules AB-7 to AB-14 (FR-QG-19) read the module register `modules.config.mjs`; AB-10 and table ownership run in `findeSchemaVerstoesse` (db tests).
- **Thresholds** (starting values, assumptions, E-15): file length ≤ 200, complexity ≤ 15, in `core` ≤ 10 (`eslint.config.js`).

## Database and tenant isolation (TE-02)

- **Test database:** `make db-up` starts PostgreSQL 16 in Docker (port 54329; `make test` and `make ci` do this themselves, in CI it runs as a service). Another server: `PFLANZENDEX_TEST_DATABASE_URL`.
- **Migrations:** SQL files in `packages/db/migrations/`, forward only, with a checksum (an applied file must never change). Apply with `make migrate`.
- **New user-owned table:** column `konto_id uuid not null references konto(id) on delete cascade`, then `select mandantenschutz('table');` and an entry in `packages/db/src/<module>/fixtures.ts` (aggregated in `packages/db/src/fixtures.ts`). If any of these is missing, the generic test (`mandant.test.ts`) fails. Tables without an account (e.g. the species catalog) need an entry with a reason in `OHNE_KONTO_KENNUNG`.
- **Access:** only through `mitKonto(pool, kontoId, …)`: a transaction, role `pflanzendex_app` (without BYPASSRLS), session variable `app.konto_id` for that transaction only.

## Sign-in (US-ACC-01, E-03)

- **Local auth server:** `make auth-up` starts Keycloak 26.8 (port 18081, realm `pflanzendex`, imported from `app/dev/keycloak/pflanzendex-realm.json`) and a mail catcher (Mailpit, http://localhost:18025). The target generates a random admin password into `app/dev/.env` (not in the repo). `make auth-down` removes both, including their data.
- **Flow:** the web app redirects to Keycloak with the OIDC authorization code flow and PKCE (sign-in and registration happen there, in German). Keycloak first requires email confirmation, then setting a password (policy: at least 10 characters). Passwords never reach us (FR-ACC-03).
- **API:** `Authorization: Bearer <access token>`; signature (JWKS), issuer and audience `pflanzendex-api` are verified. Every request sets the account via `mitKonto`. `GET /konto` returns the caller's own account data. Environment: `OIDC_ISSUER`, `OIDC_AUDIENCE`, `DATABASE_URL`, `WEB_URSPRUNG`.
- **Account creation:** `findeOderLegeKonto` (db) is the dedicated path for the first sign-in: the `anmeldung_*` policies on `konto` show and allow only the row of the verified subject (`app.subjekt`). No BYPASSRLS.
- **Web:** `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` and `VITE_API_URL` override the defaults. "Sign out on all devices" calls the Keycloak account API (`DELETE /account/sessions`).
- **Tests without Keycloak:** token, middleware and UI tests run without the auth server (locally generated keys). The flow against Keycloak was checked manually: `Docs/testprotokolle/acc-01.md`.

## Operator role and review status (TE-08)

- **Roles:** table `konto_rolle` (`betreiber`, `pruefer`), granted only through admin access, never through the application (the application role has no rights on the table; it only reads its own role through `rollen_des_kontos()`). A role grants no access to other accounts' content (P-04).
- **Review status:** table `pruefvorgang` (creator = `konto_id`, object as `objekt_art` + `objekt_id`, status `vorschlag`, `ki_ungeprueft`, `kuratiert`, `geprueft`, `zurueckgewiesen`). Operations in `core/src/katalog`: `katalog.vorschlagen` (anyone), `katalog.kuratieren` and `katalog.pruefen` (reviewers only). A database trigger enforces the same rights as well.
- **The only exception to tenant isolation:** reviewers read the review queue (`pruefvorgang`, metadata only). The tenant test proves that an operator sees nothing of other accounts in any other table (`pruefung.test.ts`).
- **Species catalog:** since BES-01, `art` references `pruefvorgang` (see below). Approval only with all required fields filled (FR-BES-14); merging and notes to the creator belong to BES-10. An AI connection never gets a role and therefore cannot approve anything (FR-BES-06).

## Locations and light zones (US-LIC-05)

- **Data:** tables `lichtzone` and `standort` (migration 0004), both with tenant isolation and names unique per account (case-insensitive). A location references its zone through the composite foreign key `(konto_id, lichtzone_id)`: a zone of another account cannot be assigned, and renaming never changes an assignment. A location without a zone is allowed and shows up in `GET /hinweise`.
- **Operations (`core/src/licht`):** `lichtzone.anlegen|aendern|loeschen|voreinstellung`, `standort.einrichten|aendern`. Writes only through `fuehreAus` with the `Idempotency-Key` header; replay protection lives in the `idempotenz` table (24 hours, an assumption).
- **API:** `GET/POST /lichtzonen`, `PUT/DELETE /lichtzonen/:id`, `POST /lichtzonen/voreinstellung`, `GET/POST /standorte`, `PUT /standorte/:id`, `GET /hinweise`. Errors: `{ fehler: { code, text, details?, daten? } }`.
- **Limit (deleting a zone):** the `ZonenNutzung` port asks every source which of them uses a zone. Today the only source is "locations". Arten link no zone (the zone is derived, FR-BES-10). **Exemplare (BES-02) link no zone either**: they reach one only through their location, which the location source already reports, so no extra source is needed yet. **The first Exemplar field that points at a zone (the override for cuttings, BES-04, and the care profile, BES-09) has to bring its source** (parameter `zusaetzlicheNutzung` of `lichtRouten`, implemented by `bestand` for its own table, never by SQL on `exemplar` from `licht`), otherwise it would go unnoticed when a zone is deleted. The mechanism is tested with a stub. Locations cannot be deleted yet (no criterion).
- **Hints:** the central hints page (US-BES-08) does not exist yet; LIC-05 shows its hints on its own page and provides them through `standortHinweise`.

## Species catalog (US-BES-01)

- **Data:** migration 0005: `art` (profile per DM-BES-01) and `art_name` (Latin, German and English name, synonyms, each with a normalized search key). Every species has exactly one review process (composite foreign key `(objekt_art, id)`, `on delete restrict`: deleting an account never takes a catalog species with it). The catalog has no `konto_id`: both tables are justified entries in `OHNE_KONTO_KENNUNG` and also listed in `KATALOG_TABELLEN`, for which the generic schema test demands enforced row rules.
- **Visibility (FR-BES-11):** everyone sees a species when its process is `kuratiert` or `geprueft`, otherwise only its creator (also `zurueckgewiesen`). `art_status()` (`security definer`) decides, because `pruefvorgang` hides other accounts processes; for that, only the owner role may read approved processes (policy `katalog_freigegeben`). `ki_ungeprueft` stays private unless an operator batch creates it. The application has only `select` and `insert` on `art` (insert only with an own process); there is no update or delete. Reviewers do not see private proposals yet (that view belongs to BES-10).
- **Operation:** `art.vorschlagen` (`core/katalog/art`) creates species, names and the `vorschlag` process in one transaction. Duplicates (same normalized Latin name or synonym among the visible species) return `art.dublette` with the existing species and write nothing. Private proposals of different accounts are not duplicates (the error would reveal foreign data); BES-10 merges them.
- **Required fields of a proposal (assumption):** Latin name, difficulty 1-3, default level 2-4, light need (lux), growth measure, etiolation signs, success criteria. Everything else is optional and shown as "unbekannt" when missing (P-08); the dormancy period only counts as a pair. A source for light need and dormancy is required only for approval (FR-BES-14).
- **API:** `GET /arten?q=` (partial word, accent- and case-insensitive, at most 50 hits, names the name it matched), `GET /arten/:id` (foreign or unknown species: 404), `POST /arten` (`Idempotency-Key`).
- **Limits:** the catalog stays empty until the catalog job (POK-03) or operator batches fill it. The hand-over to the AI client (US-KI-08) is missing. "Diese Art wählen" hands the species to the Bestand tab (US-BES-02, below). Image, traits, versions (FR-BES-12) and editing an own proposal do not exist yet. Species link no light zone (FR-BES-10), so they need no `ZonenNutzung` source; care profiles (BES-09) and the zone override of cuttings (BES-04) will.

## Exemplare (US-BES-02)

- **Data:** migration 0007 (`-- modul: bestand`): table `exemplar` with `konto_id` and a row rule (generic tenant test plus fixture `FIXTURES_BESTAND`), the name unique per account (case-insensitive), `gefangen_am` as `date` (a local calendar day, read back as text, never as a `Date`), `status` (`pflanze`, `steckling`, `archiviert`), `standort_id` empty = "unbekannt". Migration 0006 (`-- modul: licht`) only adds `unique (konto_id, id)` on `standort`, the target of the composite foreign key `exemplar_standort (konto_id, standort_id)` (AB-10, AB-14: a migration touches only the tables of its module, so the licht change is its own file).
- **Art reference (AB-10, global reference table):** `exemplar.art_id` has the plain foreign key `exemplar_art` to `art(id)` with `on delete restrict` (migration 0008). `art` has no `konto_id`, so it is registered in `GLOBAL_REFERENCE_TABLES` (`modules.config.mjs`, with owner and reason); the gate allows such a key only from a module that may depend on the owner, only to `(id)` and only with `on delete restrict`. The database refuses an unknown species and the deletion of a species in use; the operation still reads the species through the catalog (`ArtQuelle`) under the caller's account, so private proposals of other accounts stay `art.nicht_gefunden`. The application role still cannot delete species. Tests needing a species use `legeFixtureArtAn` (`db/src/fixtures.ts`).
- **Operation:** `exemplar.anlegen` (`core/src/bestand`). Only the species is required (plus the device time zone). Name by DM-BES-03 before saving: species name (German, else Latin; assumption), with a Kennzeichen `Art – Kennzeichen`. A taken name writes nothing and returns `exemplar.name_vergeben` with the existing Exemplare of the species (the database unique index decides, no pre-check race). `Gefangen_Am` is `heuteLokal(uhr, zeitzone)` (`kern/datum.ts`, NFR-08). The time zone comes with the request until the profile has one (US-ACC-02).
- **Soll-Standort (limit):** the port `SollStandortQuelle` (defined in `bestand`, to be implemented by `pflege`) is asked for the location of the species for today. Without phase logic (PHA) and care profile (BES-09) nothing implements it: `KEIN_SOLL_STANDORT` answers "unbekannt" and the location stays empty unless the keeper chooses one of their own. Nothing is invented (P-08). A chosen location wins over the port.
- **Messreihe and Behandlungsliste:** returned as empty derived lists (`messreihe: []`, `behandlungen: []`), no columns, no tables; WAC and BEH bring their own.
- **API:** `GET /exemplare`, `GET /exemplare/:id` (foreign or unknown: 404 `exemplar.nicht_gefunden`), `POST /exemplare` (`Idempotency-Key`; body `artId`, `zeitzone`, optional `kennzeichen`, `standortId`). Errors: `exemplar.name_vergeben` 409, `art.nicht_gefunden` and `standort.nicht_gefunden` 404.
- **Web:** tab "Bestand"; "Diese Art wählen" in the catalog opens the form for that species (the app wires `katalog` and `bestand`, the modules do not know each other).
- **Limits:** no editing, renaming, deleting or archiving (BES-03, BES-07); the Kennzeichen rule from the third Exemplar on (ask for missing marks) belongs to US-BES-03; Zusatz, zone override, Herkunft and sharing fields of DM-BES-02 are missing; no Exemplar hints yet (BES-08).

## Pflegephasen (US-PHA-01)

- **Derived, never stored (P-01):** `pflegephasenListe` (`core/src/pflege`) reads the Exemplare and their species and computes the phase per request: rest phase when today (`heuteLokal(uhr, zeitzone)`, the user's time zone, NFR-08) lies in the species' `Von…Bis` (month-day, both ends inclusive, may span the new year), otherwise growth phase. Only Exemplare with status `pflanze` whose species has a dormancy period are listed (cuttings and archived ones are not).
- **API:** `GET /pflegephasen?zeitzone=<IANA name>` returns `{ phasen: [{ exemplarId, name, artId, phase, standortId, sollStandortId }] }` sorted by name; a missing or invalid time zone is 400 `eingabe.ungueltig` with the field `zeitzone`. The time zone comes with the request until the profile has one (US-ACC-02).
- **Web:** tab "Pflegephasen", with an empty state that says what to do next (P-09).
- **Limits:** the target location per phase belongs to the keeper's care profile (BES-09, missing), so `sollStandortId` is always `null` ("unbekannt", P-08); `SollStandortQuelle` (FR-PHA-05) is not implemented yet. A dormancy period on the Exemplar itself (override) does not exist. The E2E flow with an Exemplar waits for a fillable species catalog; E2E covers the empty state.

## Exemplar cards (US-BES-06)

- **What:** `GET /exemplare/karten?zeitzone=Europe/Berlin` returns one derived card per own Exemplar (no table, no migration): name, Art name, status, location, light zone (the zone of the location; a zone override on the Exemplar comes with BES-04), last measurement, photo, and the earliest open treatment with "+N weitere". A missing or unknown time zone is `eingabe.ungueltig` (400); "today" is the local date in that zone (NFR-08). The route sits before `/exemplare/:id`.
- **Ports (module `bestand`, registered in `modules.config.mjs`):** `MessungsQuelle` (last measurement and youngest photo per Exemplar, to be implemented by `pflege`/WAC) and `BehandlungsQuelle` (open treatments, `pflege`/BEH). Both are asked once for all own Exemplar ids, never for foreign ones. Until they exist, `KEINE_MESSUNGEN` and `KEINE_BEHANDLUNGEN` answer empty: cards show "Noch kein Foto", "noch keine Messung", "keine offene Behandlung". `createApp` takes `messungen` and `behandlungen` options for them.
- **Unknown stays unknown (P-08):** an Art the account cannot see, a location without zone or a missing location is `null` and shown as "unbekannt". Etiolated growth ("Vergeilt/dünn") is shown as a warning, never as success.
- **Web:** tab "Bestand" shows the cards in a grid (`repeat(auto-fill, minmax(min(100%, 16rem), 1fr))`: one column on narrow phones, more when there is room); the note of the last measurement is a native `<details>`; the photo is a link that opens it large.
- **Limits:** photo, measurement and treatment data appear only once WAC and BEH implement the ports (the card logic is tested with stubs); archived Exemplare are not hidden yet (BES-07).

**Operations (TE-03):** containers, Compose, backup and deploy live in `deploy/`; see the runbook `Docs/operations/staging-deploy-and-backup.md`. Targets: `make deploy`, `make backup`, `make restore-test`.

## End-to-end tests (QG-T3, QG-U1)

- **Target:** `make e2e` starts the test database and Keycloak (`db-up`, `auth-up`), applies the migrations and runs Playwright (package `packages/e2e`; Playwright starts API and web itself). Needs Docker. Projects: `mobil` (Pixel 7) and `desktop`.
- **When:** not on every PR into `dev`, but on PRs `dev` to `main`, nightly and manually (`ci.yml`, `nightly.yml`; E-13/E-15). Failures fail the job; the report is the artifact `e2e-report`.
- **Covered:** sign-in against the real Keycloak (US-ACC-01) and locations/light zones (US-LIC-05). Test accounts are created through the Keycloak admin API; registration with mail confirmation stays documented manually (`Docs/testprotokolle/acc-01.md`).
- **Accessibility:** axe runs inside the tests as a report (attachment `axe-*.json`, job summary) and never fails a test (FR-QG-09).
