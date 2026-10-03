# PflanzenDex app

Monorepo (npm workspaces) with four packages. Every task runs through the `Makefile` in the repo root (`make help`). Tooling and docs are English; domain code uses the German glossary terms from the specs (`konto`, `exemplar`, `pruefvorgang`, …).

| Package         | Contents                                        | Rule                                                                                                                                        |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | Domain logic, pure functions                    | imports nothing from API, web, database, file system or network (AB-1); every directory with code has an `index.ts`                         |
| `packages/db`   | PostgreSQL schema, migrations, tenant isolation | meant for `api` only; `core` and `web` never import it; every user-owned table carries `konto_id` and calls `mandantenschutz()` (FR-ACC-02) |
| `packages/api`  | HTTP API (Hono)                                 | calls `core` only through `@pflanzendex/core` (AB-2)                                                                                        |
| `packages/web`  | Mobile-first PWA (React, Vite)                  | calls `core` only through `@pflanzendex/core` (AB-2)                                                                                        |

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
- **New user-owned table:** column `konto_id uuid not null references konto(id) on delete cascade`, then `select mandantenschutz('table');` and an entry in `packages/db/src/fixtures.ts`. If any of these is missing, the generic test (`mandant.test.ts`) fails. Tables without an account (e.g. the species catalog) need an entry with a reason in `OHNE_KONTO_KENNUNG`.
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
- **Review status:** table `pruefvorgang` (creator = `konto_id`, object as `objekt_art` + `objekt_id`, status `vorschlag`, `ki_ungeprueft`, `kuratiert`, `geprueft`, `zurueckgewiesen`). Operations in `core`: `katalog.vorschlagen` (anyone), `katalog.kuratieren` and `katalog.pruefen` (reviewers only). A database trigger enforces the same rights as well.
- **The only exception to tenant isolation:** reviewers read the review queue (`pruefvorgang`, metadata only). The tenant test proves that an operator sees nothing of other accounts in any other table (`pruefung.test.ts`).
- **Species catalog:** since BES-01, `art` references `pruefvorgang` (see below). Approval only with all required fields filled (FR-BES-14); merging and notes to the creator belong to BES-10. An AI connection never gets a role and therefore cannot approve anything (FR-BES-06).

## Locations and light zones (US-LIC-05)

- **Data:** tables `lichtzone` and `standort` (migration 0004), both with tenant isolation and names unique per account (case-insensitive). A location references its zone through the composite foreign key `(konto_id, lichtzone_id)`: a zone of another account cannot be assigned, and renaming never changes an assignment. A location without a zone is allowed and shows up in `GET /hinweise`.
- **Operations (`core/operationen/licht`):** `lichtzone.anlegen|aendern|loeschen|voreinstellung`, `standort.einrichten|aendern`. Writes only through `fuehreAus` with the `Idempotency-Key` header; replay protection lives in the `idempotenz` table (24 hours, an assumption).
- **API:** `GET/POST /lichtzonen`, `PUT/DELETE /lichtzonen/:id`, `POST /lichtzonen/voreinstellung`, `GET/POST /standorte`, `PUT /standorte/:id`, `GET /hinweise`. Errors: `{ fehler: { code, text, details?, daten? } }`.
- **Limit (deleting a zone):** the `ZonenNutzung` port asks every source which of them uses a zone. Today the only source is "locations"; Exemplare and Arten arrive with BES. **BES has to add one source each** (parameter `zusaetzlicheNutzung` of `lichtRouten`), otherwise they would go unnoticed when a zone is deleted. The mechanism is tested with a stub. Locations cannot be deleted yet (no criterion).
- **Hints:** the central hints page (US-BES-08) does not exist yet; LIC-05 shows its hints on its own page and provides them through `standortHinweise`.

## Species catalog (US-BES-01)

- **Data:** migration 0005: `art` (profile per DM-BES-01) and `art_name` (Latin, German and English name, synonyms, each with a normalized search key). Every species has exactly one review process (composite foreign key `(objekt_art, id)`, `on delete restrict`: deleting an account never takes a catalog species with it). The catalog has no `konto_id`: both tables are justified entries in `OHNE_KONTO_KENNUNG` and also listed in `KATALOG_TABELLEN`, for which the generic schema test demands enforced row rules.
- **Visibility (FR-BES-11):** everyone sees a species when its process is `kuratiert` or `geprueft`, otherwise only its creator (also `zurueckgewiesen`). `art_status()` (`security definer`) decides, because `pruefvorgang` hides other accounts processes; for that, only the owner role may read approved processes (policy `katalog_freigegeben`). `ki_ungeprueft` stays private unless an operator batch creates it. The application has only `select` and `insert` on `art` (insert only with an own process); there is no update or delete. Reviewers do not see private proposals yet (that view belongs to BES-10).
- **Operation:** `art.vorschlagen` (`core/operationen/art`) creates species, names and the `vorschlag` process in one transaction. Duplicates (same normalized Latin name or synonym among the visible species) return `art.dublette` with the existing species and write nothing. Private proposals of different accounts are not duplicates (the error would reveal foreign data); BES-10 merges them.
- **Required fields of a proposal (assumption):** Latin name, difficulty 1-3, default level 2-4, light need (lux), growth measure, etiolation signs, success criteria. Everything else is optional and shown as "unbekannt" when missing (P-08); the dormancy period only counts as a pair. A source for light need and dormancy is required only for approval (FR-BES-14).
- **API:** `GET /arten?q=` (partial word, accent- and case-insensitive, at most 50 hits, names the name it matched), `GET /arten/:id` (foreign or unknown species: 404), `POST /arten` (`Idempotency-Key`).
- **Limits:** the catalog stays empty until the catalog job (POK-03) or operator batches fill it. The hand-over to the AI client (US-KI-08) and creating an Exemplar (BES-02) are missing: "Diese Art wählen" only remembers the species in the UI. Image, traits, versions (FR-BES-12) and editing an own proposal do not exist yet. Species link no light zone (FR-BES-10), so they need no `ZonenNutzung` source; Exemplare and care profiles do.

**Operations (TE-03):** containers, Compose, backup and deploy live in `deploy/`; see the runbook `Docs/operations/staging-deploy-and-backup.md`. Targets: `make deploy`, `make backup`, `make restore-test`.
