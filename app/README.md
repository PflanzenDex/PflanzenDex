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

```bash
make setup   # install dependencies
make dev     # start API (port 3000) and web (Vite)
make ci      # all gates: lint, types, boundaries, format, tests, build
```

- **Node:** version 24 (`.nvmrc`). Vitest 5 does not officially support odd Node versions (e.g. 25).
- **TypeScript 6.0.x** is pinned on purpose: `typescript-eslint` does not support TypeScript 7 yet (peer range `<6.1`).
- **Boundary check:** `npm run boundaries` (script and tests in `scripts/`); messages name the rule ID, file and line.
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
- **Limit:** the species catalog (table `art`) arrives with BES-01. There, the `art` table has to reference `pruefvorgang` (`objekt_art = 'art'`), handle visibility itself (a proposal is visible only to its creator, FR-BES-11) and allow approval only when all required fields are filled (FR-BES-14); merging and notes to the creator belong to BES-10. An AI connection never gets a role and therefore cannot approve anything (FR-BES-06).

## Locations and light zones (US-LIC-05)

- **Data:** tables `lichtzone` and `standort` (migration 0004), both with tenant isolation and names unique per account (case-insensitive). A location references its zone through the composite foreign key `(konto_id, lichtzone_id)`: a zone of another account cannot be assigned, and renaming never changes an assignment. A location without a zone is allowed and shows up in `GET /hinweise`.
- **Operations (`core/src/licht`):** `lichtzone.anlegen|aendern|loeschen|voreinstellung`, `standort.einrichten|aendern`. Writes only through `fuehreAus` with the `Idempotency-Key` header; replay protection lives in the `idempotenz` table (24 hours, an assumption).
- **API:** `GET/POST /lichtzonen`, `PUT/DELETE /lichtzonen/:id`, `POST /lichtzonen/voreinstellung`, `GET/POST /standorte`, `PUT /standorte/:id`, `GET /hinweise`. Errors: `{ fehler: { code, text, details?, daten? } }`.
- **Limit (deleting a zone):** the `ZonenNutzung` port asks every source which of them uses a zone. Today the only source is "locations"; Exemplare and Arten arrive with BES. **BES has to add one source each** (parameter `zusaetzlicheNutzung` of `lichtRouten`), otherwise they would go unnoticed when a zone is deleted. The mechanism is tested with a stub. Locations cannot be deleted yet (no criterion).
- **Hints:** the central hints page (US-BES-08) does not exist yet; LIC-05 shows its hints on its own page and provides them through `standortHinweise`.

**Operations (TE-03):** containers, Compose, backup and deploy live in `deploy/`; see the runbook `Docs/operations/staging-deploy-and-backup.md`. Targets: `make deploy`, `make backup`, `make restore-test`.
