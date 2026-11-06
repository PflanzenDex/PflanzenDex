# Release, deploy and rollback

Covers US-DEV-06 (release process), E-13 (branch model) and E-14 (every deploy is a deliberate, manual step; production only from `main` with a stable release tag, see "Deploying with GitHub Actions (TE-19)" in `staging-deploy-and-backup.md`). Host setup, backups and restore: `staging-deploy-and-backup.md`.

## Release chain

1. A release is the pull request `dev` -> `main` with the full suite.
2. On `main`, after a green CI, semantic-release derives the next SemVer from the Conventional Commits and creates the tag `vX.Y.Z` and the GitHub release. It does not commit back (PR #195), so there is no version commit to merge back.
3. Nothing deploys automatically. The release only produces the tag.

## Where the version comes from

There is one source: the git tag. No version is written into versioned files.

- `deploy.sh` computes `APP_VERSION="$(git describe --tags --always)"`, for example `v0.1.0` (exactly on the tag) or `v0.1.0-3-gabc1234` (3 commits after it), and `GIT_SHA` (short commit).
- `docker-compose.yml` passes both as build args. The api image sets them as env vars, the web image as `VITE_APP_VERSION` at build time.
- `GET /health/details` returns `{"status":"ok","product":"PflanzenDex","version":"<describe>","commit":"<sha>","checks":{…}}` (checks of database and job queue, see `staging-deploy-and-backup.md`). The proxy does not serve it on the public name; the public `GET /health` answers only `{"status":"ok"}` (#759). Both show `unknown` if the build did not get a value (P-08).
- The web app shows `Version <describe>` as the last line of "Was die App kann" (Konto, `/account/functions`).
- Local dev (`make dev`) has no build arg, so both show `unknown`.

## Deploy

On the host, in the checkout: `make deploy` (or `app/config/deploy/scripts/deploy.sh [ref]`, default `origin/main`; pass a tag such as `v0.1.0` to deploy a specific release).

Steps: fetch (with tags), remember the current commit as the rollback target, back up the database if it is running, check out the ref, build and start, wait for the api healthcheck, wait for the keycloak healthcheck, then for the realm `pflanzendex` (`wait_realm`), run the master realm and MCP steps, run the smoke test.

**The realm wait (TE-03, #1002).** Keycloak reports healthy about 20 s before the realm import of a first start has ended, and until then every realm URL answers 503. `wait_realm` therefore waits until the realm's discovery URL (`/realms/pflanzendex/.well-known/openid-configuration`) answers 200 inside the keycloak container, with a probe from bash's `/dev/tcp` (the image has no curl; the host does not need to reach Keycloak). It is one wait before everything that needs the realm: `master-realm.sh`, `keycloak-mcp` and the smoke sign-in. Starting value, assumption: 60 tries every 2 s. A realm that does not answer in time fails the deploy with `realm pflanzendex did not answer 200 at http://127.0.0.1:8080/realms/pflanzendex/.well-known/openid-configuration inside keycloak after 60 tries`, followed by the command for the keycloak log (a failed import of a first start shows there), and the deploy rolls back like any other failed step.

## Smoke test

`app/config/deploy/scripts/smoke.sh <base-url> <expected-version>` passes only if

- `GET <base-url>/health` answers 200 with the status only (no `version`, `commit` or `checks`),
- `/health/details` reports the version just deployed as its `version`; `deploy.sh` reads it inside the api container (`SMOKE_DETAILS_CMD`, default: `curl <base-url>/health/details`), and
- `GET <base-url>/` (web root, through the proxy) answers 200.

When the tester's credentials are set (below), the core flow of US-DEV-06 must work as well (#1404):

- the tester signs in at the sign-in service the way a browser does: authorization code flow with PKCE (S256) for the public client `pflanzendex-web`, with curl only (direct grants stay off); the login form is read from the page, the password is posted on stdin, and the code is taken from the redirect to `<APP_URL>/` without following it; the code is exchanged at the token endpoint with the verifier, and
- `GET <base-url>/api/today?timeZone=Europe/Berlin` ("Heute") with the bearer token answers 200 with a `date` and an `items` list (it may be empty for a new tester).

**Output.** Without the credentials the check is skipped, and the output says so in one line, then the usual result:

```
smoke: sign-in check skipped: SMOKE_USER/SMOKE_PASSWORD not set (#1404)
smoke ok: v0.1.0 at https://localhost:8443
```

With one of the two missing, the line names it. With both set and a passing check: `smoke: sign-in ok and Heute answered for the smoke user (#1404)`. A failing sign-in or Heute check fails the smoke test (exit 1), and `deploy.sh` rolls back as for any failed smoke test (see "Automatic rollback"). A refused sign-in (wrong password, or an action pending for the tester) is not retried, because every refused sign-in counts against the tester's brute-force protection; the reason is printed without the password.

**Variables** (all in `app/config/deploy/.env` on the host; the Deploy workflow does not send them, `.github/deploy-env-allowlist.txt` does not list them):

| Variable               | Meaning                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SMOKE_USER`           | The tester's sign-in name (`smoke-tester` by default, lower case letters, digits, dots, dashes and underscores).                      |
| `SMOKE_PASSWORD`       | The tester's password (48 hex characters, generated by the script below).                                                             |
| `SMOKE_AUTH_URL`       | Set by `deploy.sh`: the sign-in service as the host reaches it (through the proxy, `AUTH_URL` with the `Host` header of `AUTH_HOST`). |
| `SMOKE_AUTH_CURL_OPTS` | Set by `deploy.sh`: curl options for the sign-in service (`-H Host:…` behind the proxy, `-k --resolve …` on `localhost`).             |
| `SMOKE_APP_URL`        | The app address the sign-in service has as redirect target. Default `APP_URL`.                                                        |

**One-time setup** (on the host, in the checkout; the script needs the keycloak and db containers running):

1. `app/config/deploy/keycloak/smoke-user.sh` creates the user in the realm `pflanzendex` (verified email, enabled, no required actions, a generated password) and the app's account row for its subject (`insert into account … on conflict do nothing`, through the cluster user `POSTGRES_USER`, as the backup and restore scripts do). It needs the bootstrap admin of the master realm, as `master-realm.sh` does. Registration by invitation (`invitation-phase.md`) would refuse a new tester at its first sign-in (`invitation.required`); the account row written here avoids that. Without invitation-only registration the first smoke sign-in would create the row anyway.
2. The script prints two lines, `SMOKE_USER=…` and `SMOKE_PASSWORD=…`. Add them to `app/config/deploy/.env` (replace older lines of the same name). The password is printed only when the user is created or rotated; it is not stored anywhere else.
3. Run the script again: it reports that the tester exists and changes nothing. `smoke-user.sh --rotate-password` sets a new password and prints new lines (then update `.env`).
4. The next deploy shows the sign-in line above. The tester holds no real data and must stay that way: nobody signs in as the tester by hand.

The sign-in service after the admin handover: the bootstrap admin is gone, so the script stops with "FAILED (ERROR login)". Create the user as the named admin instead, with the same attributes: `kcadm.sh create users -r pflanzendex -s username=smoke-tester -s email=smoke-tester@example.com -s emailVerified=true -s enabled=true -s firstName=Smoke -s lastName=Tester -i`, then `kcadm.sh set-password -r pflanzendex --username smoke-tester --new-password <generated>`, then the account row as in step 1, and the two `.env` lines.

It retries (`SMOKE_RETRIES`, default 15, every `SMOKE_DELAY`, default 2 s) because the proxy needs a moment. `deploy.sh` derives the base URL from `APP_HOST`, `CADDY_SCHEME`, `HTTP_PORT` and `HTTPS_PORT` in `deploy/.env`; override with `SMOKE_URL` (then the sign-in service is reached at `AUTH_URL`). For `localhost` it uses `curl -k` (internal Caddy CA).

## Automatic rollback

If the api does not become healthy, the realm `pflanzendex` does not answer 200 in time, or the smoke test fails, `deploy.sh` redeploys the previous commit (build, start, health, realm, smoke test again) and exits non-zero with a clear message:

- `ROLLBACK ok ...`: the previous version is live again, the new one is not. Exit code is still 1, so the failed deploy is not mistaken for a success.
- `ROLLBACK FAILED`: intervene manually (below).

Limits: database migrations are not reverted. Migrations must be expand/contract so the previous version still works (US-DEV-07). If data was damaged, restore the pre-deploy backup with `app/config/deploy/scripts/restore/restore.sh`.

## Manual rollback

On the host, in the checkout: `make deploy` does not take a ref, so call the script: `app/config/deploy/scripts/deploy.sh v0.1.0` (the last good tag). The script runs the same backup, build and smoke test. Check afterwards with `curl -s https://<host>/health` (status) and, on the host, `docker compose --env-file .env exec -T api wget -qO- http://127.0.0.1:3000/health/details` (version).

## Filling the catalog (first release, #991)

A fresh installation has an empty species catalog, so the first plant fails at the species search (US-ONB-01). Four steps, always in this order. All commands run on the host in the checkout; `c` is the compose shortcut used in `staging-deploy-and-backup.md`.

```bash
c="docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml"
DB=$(grep '^POSTGRES_DB=' app/config/deploy/.env | cut -d= -f2)
```

1. **Migrate and deploy** (`make deploy`, which backs up first and runs `migrate`). Check: `$c logs migrate` ends without error.
2. **Load the curated start catalog and the researched attributes** (`catalog:load`, 137 houseplants). Always in this order: `catalog:check-data`, then the dry run, then the load.

   ```bash
   $c exec -T api npm run catalog:check-data                       # checks the research data, needs no database
   $c exec -T api npm run catalog:load -- --dry-run                 # summary only, writes nothing
   $c exec -T api npm run catalog:load -- --confirm "$DB" | tee "catalog-load-$(date +%F).log"
   ```

   **Research data.** One JSON file per part under `app/packages/api/src/catalog/load/research/data/batch-NN/part-N.json` (at most 5 parts per batch folder, layout rule), each a list of records, one per species of the start list:

   ```json
   [
     {
       "species": "Monstera deliciosa",
       "attributes": {
         "toxicToPets": {
           "value": true,
           "sourceUrl": "https://en.wikipedia.org/w/index.php?title=Monstera_deliciosa&oldid=1374208594",
           "sourceName": "wikipedia",
           "license": "CC-BY-SA-4.0",
           "retrievedOn": "2026-10-30",
           "note": "Section Toxicity"
         }
       }
     }
   ]
   ```

   Attributes are those of DM-ENT-01: `humidity` (`low`/`medium`/`high`), `minTemperature` (°C, -30 to 30), `growthSize` (`small`/`medium`/`large`), `toxicToPets` (true/false). An attribute that is not sourced is left out and stays unknown (P-08). `catalog:check-data` refuses a value without an https link on an allowed host (`gbif.org`, `api.gbif.org`, `wikidata.org`, `www.wikidata.org`, `de.wikipedia.org`, `en.wikipedia.org`, `commons.wikimedia.org`, matching `sourceName` `gbif`/`wikidata`/`wikipedia`), without a license from `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-SA-3.0`, with a retrieval date after today, an unknown attribute or key, a value outside its range, a note over 300 characters, a species listed twice or a species not on the start list; it prints one line per problem (`<file>: <species> / <attribute>: <code>`) and exits 1. How to research: `catalog-research-howto.md`.

   **Load.** It runs inside the api container, as the owner role, which is neither superuser nor BYPASSRLS (`DB_ROLE_CHECK`). It runs the data check first and refuses with the same lines on any problem (nothing is written). Species are written as the operator account `catalog-load` under the application role and the row rules, provenance and the attribute values with owner rights, all in one transaction. It writes names, family and synonyms only; difficulty, default level and lux need (#1003) and growth measure, etiolation signs and success criteria (#1005) stay unknown until a value with a source is entered (P-08). Attribute values go to `taxon_attribute` with source, link, license and retrieval date; they show as "ungeprüft" until a reviewer confirms them (US-ENT-09).

   The summary names host and database (never the password), the number of new and present species and the attribute values (`new`, `changed`, `unchanged`). Without `--confirm <database name>` (or `CATALOG_LOAD_CONFIRM`) nothing is written. Running it again adds nothing; a changed value in the data replaces the stored one (one row per species and field). What it stores per species: Latin name, family, German and English name and synonyms of renamed species; provenance `origin = operator`, license `CC0-1.0` (assumption, E-25) per field; no source links are invented. An unverified German name stays empty (P-08).

3. **Switch the fill from open sources on:** set `CATALOG_FILL=on` in `app/config/deploy/.env`, then `$c up -d api`. The job (US-BES-12) asks GBIF, Wikipedia and Wikidata for the family, the German name and the botanical story of every approved species with a gap, one request at a time through the source client, and only fills empty fields (the start catalog is never overwritten); it records source, link, license and date per field. Progress: `$c logs -f api`, or the counts below.
4. **Then `ATTRIBUTE_FILL=on`** (same way). It sends nothing itself; it turns the answers the catalog fill stored into species attributes for Discover (US-ENT-09), so it is useful only after step 3 has run. Both values accept only `on` or `off`; any other value stops the api at start (P-10).

The taxonomy build (US-POK-03) needs no step: it checks hourly whether the approved catalog differs from the stored tree and builds it from OpenTree, Wikidata and Wikipedia, so it picks up the start catalog on its own. `TAXONOMY_BUILD=off` in `.env` stops the check; the default is on.

**Check queries** (`species_status` hides nothing from the cluster user; "approved" means review status `curated` or `reviewed`):

```bash
$c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atf -' <<'SQL'
select count(*) as approved_species from species s join review_case v on v.object_kind = 'species' and v.object_id = s.id where v.status in ('curated', 'reviewed');
select count(*) as with_source_snapshot from (select distinct species_id from catalog_source_snapshot) x;
select count(*) as taxa from taxon;
SQL
```

Expected after step 2: `approved_species` 137 or more. After step 3 (minutes to hours, depending on source limits): `with_source_snapshot` rises towards `approved_species`. Then open the app and search "Monstera" in the species search of the first-plant flow: it must list a hit. If the catalog is empty, the species search says so in German and names the next step (operator: run step 2).

**Rollback.** Before step 2 take `make backup`; the data rollback is the restore of that dump (`staging-deploy-and-backup.md`). A targeted removal is only safe while no specimen points at the loaded species; the foreign keys then stop a wrong delete, so never use `session_replication_role` for it:

```bash
$c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atf -' <<'SQL'
begin;
with gone as (delete from species where created_by = 'operator' and source like 'Curated start catalog%' returning id)
delete from review_case where object_kind = 'species' and object_id in (select id from gone);
commit;
SQL
```

If it fails on a foreign key, species are in use: restore instead, or leave them. A wrong attribute value is corrected in the data file and loaded again (the newer value replaces it); to drop one, delete its row (`delete from taxon_attribute where latin_name = '<Latin name>' and field = '<field>';`) and remove it from the data file in the same PR, otherwise the next load writes it again. To stop a fill, set `CATALOG_FILL=off` (or empty) and `$c up -d api`; values already set stay (nothing disappears silently, P-10) and carry their provenance.

**Data fix for the starting values of catalogs loaded before 0.2.0 (#1024, one-off, test host only).** Migrations `0095` and `0096` clear the invented starting values (P-08) only on rows that are still at version 1 and have `reviewed_by` null. But `review_case_guard` sets `reviewed_by` on every curated row, so the batch's rows never match that guard: on the test host all 137 species kept difficulty, default level, light need, growth measure, etiolation signs and success criteria. A catalog loaded with 0.2.0 or later holds none of these values (#1003, #1005) and needs no fix. The fix is not a migration. Two scripts in `docs/guides/operations/catalog-starting-values/` share one selection:

- `dry-run.sql` reads only (`begin read only`) and prints one JSON document.
- `fix.sql` writes, in one transaction, and only with `-v expected=<rows_to_change>` from the dry run.

Per species the selection requires: created by the operator, source = the batch marker (the text of `catalog:load` before #1004 or after it), review case `curated` and reviewed by the `catalog-load` account. A curated case cannot change afterwards, so no later review can exist. A species with a user correction or with a merged proposal pointing to it is counted and left alone. A field is cleared only when it holds exactly the value the batch wrote: difficulty and default level from the start list before #1004, light need from the default level (3000, 8000 or 20000 lx), growth measure `height`, and the two generic texts. Any other value is kept and counted. A cleared row gets the current source marker and `version + 1`.

1. **Back up first.** `make backup` (hosts without `make`: `app/config/deploy/scripts/backup.sh`, the same script). Check that the dump exists in `BACKUP_DIR` and keep its path for the rollback.
2. **Dry run.** Needs the checkout at a ref that has the two files. Read the output: `batch_reviewed_at` should show one time, `candidates` the batch size, `kept_differs_or_unknown` what was not cleared and why, `rows_to_change` the count for step 3, `sample_before` three rows before the fix.

   ```bash
   $c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA -f -' < docs/guides/operations/catalog-starting-values/dry-run.sql
   ```

3. **Write**, only after the dry run was reviewed, with the count from step 2:

   ```bash
   $c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v expected=<rows_to_change> -tA -f -' < docs/guides/operations/catalog-starting-values/fix.sql
   ```

   It commits only if exactly `expected` rows changed; otherwise it rolls back and exits with status 3. Without `-v expected` it changes nothing. Running it again is harmless: the next dry run reports `rows_to_change` 0.

4. **Check.** The next dry run reports `rows_to_change` 0. The species profile on the test host shows "unbekannt" for the six fields (open one species; the profile is the check of P-08).
5. **Rollback.** A failed run changes nothing (one transaction). For a wrong result after the commit, restore the dump of step 1 as described in `staging-deploy-and-backup.md` ("Backup and restore").

The folder is a one-off. Remove it in a later pull request once every host that loaded the batch has run it; the dry-run output belongs in the pull request's test evidence. Production has no batch rows (a catalog loaded with 0.2.0 or later), so the dry run there reports `batch_rows` 0 and there is nothing to do.

**Must never run on production:** `npm run seed:catalog` and `npm run seed:demo` (dev and test only, they use a superuser connection and invented demo data; both refuse unless `PFLANZENDEX_ENV` is `local` or `test` and the database is on this machine). Do not run `catalog:load` against a database you did not name in `--confirm`.

## Hotfix path (E-13)

1. Branch from `main` (`fix/...`), keep the change small.
2. Pull request to `main` with the full suite; no bypassing of gates. semantic-release tags the patch release.
3. Deploy the new tag deliberately.
4. Merge `main` back into `dev` through a pull request so the branches do not drift.

## Feature switches (US-DEV-06)

Three function groups can be switched: `social` (friends, feed, swap, sharing, shared equipment), `ai` (the `/mcp/*` interface, `/ai/*`, the AI clients section in the account) and `recommendations` (placeholder, nothing is built yet).

- **Global:** the environment variable `FEATURES`, a comma separated list, e.g. `FEATURES=social,ai` in `app/config/deploy/.env`. In production (`NODE_ENV=production`, set by the image) nothing set means all off; in development and tests nothing set means all on. An unknown name stops the start. Changing it needs a restart of the api (`docker compose up -d api`).
- **Per account:** the operator opens a function for single accounts without the global switch. A function is on for an account when the global switch is on **or** the account switch is on. In the database console (`docker compose exec db psql`):
  - on: `insert into account_feature (account, feature) values ('<account id>', 'social');` (the account id is `id` from `GET /account`, or `select id from account_data where email = '...'`)
  - off again: `delete from account_feature where account = '<account id>' and feature = 'social';`
  - look: `select account, feature from account_feature;`
- **What off means:** the API answers 404 like a path that does not exist, the navigation and sections of the web app do not appear, and no job of the function runs. The data stays untouched; switching on restores everything. The public metadata `/.well-known/oauth-protected-resource` stays reachable because it has no account.
- **Catalog fill from open sources (US-BES-12):** the environment variable `CATALOG_FILL=on` in `app/config/deploy/.env` lets the api order and run the job `catalog.fill_from_sources`, which asks GBIF, Wikipedia and Wikidata for approved species with gaps (throttled, cached, with the user agent of the api). Unset or `off` means no foreign request at all; any other value stops the start. Restart the api after changing it.
- **Attribute fill (US-ENT-09):** the environment variable `ATTRIBUTE_FILL=on` lets the api order and run the job `catalog.fill_attributes`, which turns the Wikidata answers stored by the catalog fill into species attributes (growth size) with source, license and date. It sends no request itself and finds nothing without `CATALOG_FILL=on` having run first. Unset or `off` means the job does not run; any other value stops the start. Restart the api after changing it.
- **Before a release:** check the values in `.env` (the release checklist asks for it). Open the three start users first with the account switch, leave `FEATURES` empty.

## Open

- FR-DEV-05: check that the latest `v*` tag on `main` was created by semantic-release (no manual tags). Not implemented, no simple CI check exists; options are a tag ruleset on GitHub (only the release workflow may create `v*` tags) or a scheduled check.
- The smoke test does not yet check that the web app shows the same version (the root is only checked for 200).
