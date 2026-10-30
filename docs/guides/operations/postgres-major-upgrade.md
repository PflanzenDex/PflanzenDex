# Runbook: PostgreSQL 16 to 18 (one-time upgrade of a host)

Ticket US-DEV-07 (#981). Basis: NFR-15 (a restorable backup before every change), E-01 (one host, Docker Compose). Renovate does not propose PostgreSQL major versions (`.github/renovate.json5`), so a major is a planned upgrade with this runbook. The test host goes first; staging or production follow the same steps.

## What changes

- The services `db`, `keycloak-db` and `db-roles` use `postgres:18-alpine` (`app/config/deploy/docker-compose.yml`). Only `db` holds data.
- The volume `pflanzendex_dbdata` is mounted at `/var/lib/postgresql` (it was `/var/lib/postgresql/data`), because the 18 image keeps its data in `/var/lib/postgresql/18/docker`.
- The two layouts do not fit into each other:

| Image | Data directory in the container | Where `PG_VERSION` sits in the volume `pflanzendex_dbdata` |
| ----- | ------------------------------- | ---------------------------------------------------------- |
| 16    | `/var/lib/postgresql/data`      | at the root of the volume                                  |
| 18    | `/var/lib/postgresql/18/docker` | in `18/docker/`                                            |

- The data is not converted in place. The upgrade dumps both databases, keeps a copy of the 16 volume, starts 18 on a fresh volume and restores the dumps.
- Behaviour change found by the test suite: a delete refused by `ON DELETE RESTRICT` raises SQLSTATE `23001` (restrict_violation) on 18 and `23503` (foreign_key_violation) on 16. The only `RESTRICT` keys are `specimen_species`, `care_profile_species`, `review_case_merged_into_fkey` and `species_object_kind_id_fkey` (checked on the test schema); the in-use mappings in `packages/db` check `23503` on keys with the default `NO ACTION`, which still raise `23503`. The test `specimens.test.ts` accepts both codes.
- `deploy.sh` runs the check `check_db_volume` before every `up`, also for a rollback. It compares the volume with the PostgreSQL image of the checked-out compose file:

| Volume contains              | Image 16          | Image 18              |
| ---------------------------- | ----------------- | --------------------- |
| nothing (new host)           | starts            | starts                |
| 16 data (root of the volume) | starts            | refused, this runbook |
| 18 data (`18/docker`)        | refused, rollback | starts                |

A refusal starts nothing and prints the volume, the expected layout and this runbook (P-10). The official 18 image refuses 16 data at the volume root as well; the check also catches the other direction, where 16 would start an empty cluster in its `data` folder.

## Before you start

- You are in the checkout of the host, with `app/config/deploy/.env` (`make deploy` works there).
- Write down the commit of the running 16 version (`SHA16`) and the full commit of this change (`SHA18`). `SHA16` is the rollback target.
- `make backup` works on the running stack. Free disk space for one more copy of the database volume: `docker run --rm -v pflanzendex_dbdata:/v:ro alpine:3 du -sh /v`.
- `make restore-test` passed with the 18 image (development machine or test host).
- Downtime lasts from the stop of `api` (step 2) until `deploy.sh` reports `Deploy ok` (step 7). It depends on the size of the dumps; measure it on the test host first.

The commands below run from the checkout and use this shorthand (bash):

```bash
COMPOSE="docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml"
```

## 1. Starting point

```bash
git rev-parse HEAD                          # SHA16: keep it
docker run --rm -v pflanzendex_dbdata:/v:ro alpine:3 sh -c 'cat /v/PG_VERSION; echo; du -sh /v'
```

Expected: `16` and the size of the volume.

## 2. Stop the writers

```bash
$COMPOSE stop api web keycloak
```

The proxy stays up and answers 502 until the deploy has finished. `db` keeps running for the backup.

Save the row counts of the 16 database while nothing writes to it:

```bash
mkdir -p ~/pflanzendex-backups
cat > ~/pflanzendex-backups/counts.sql <<'SQL'
select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;
SQL
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -f -' < ~/pflanzendex-backups/counts.sql > ~/pflanzendex-backups/counts-pg16.txt
wc -l < ~/pflanzendex-backups/counts-pg16.txt
```

## 3. Back up both databases and check the dumps

```bash
make backup
APP_DUMP=$(ls ~/pflanzendex-backups/pflanzendex-*.dump | sort | tail -1)
KC_DUMP=$(ls ~/pflanzendex-backups/keycloak-*.dump | sort | tail -1)
docker run --rm -v ~/pflanzendex-backups:/b:ro postgres:18-alpine pg_restore -l "/b/$(basename "$APP_DUMP")" > /dev/null && echo "app dump readable by 18"
docker run --rm -v ~/pflanzendex-backups:/b:ro postgres:18-alpine pg_restore -l "/b/$(basename "$KC_DUMP")" > /dev/null && echo "sign-in dump readable by 18"
```

`backup.sh` already checks each dump with the 16 client. The second check uses the 18 client, which must read the 16 dumps. Copy both dumps and `counts-pg16.txt` off the host as well (`BACKUP_REMOTE` or by hand): the local retention deletes them after `BACKUP_RETENTION_DAYS`.

## 4. Keep the 16 volume as a copy, then free its name

```bash
$COMPOSE down
docker volume create pflanzendex_dbdata_pg16
docker run --rm -v pflanzendex_dbdata:/from:ro -v pflanzendex_dbdata_pg16:/to alpine:3 cp -a /from/. /to/
docker run --rm -v pflanzendex_dbdata:/a:ro -v pflanzendex_dbdata_pg16:/b:ro alpine:3 diff -r /a /b && echo "copy identical"
docker volume rm pflanzendex_dbdata
```

`down` keeps the volumes; never add `-v` here. The copy `pflanzendex_dbdata_pg16` is the rollback point (step "Rollback"). The name `pflanzendex_dbdata` must go, otherwise compose would reuse the 16 volume and the check refuses it.

## 5. Start the 18 database on the new volume with its one-shots

```bash
$COMPOSE up -d --wait db
$COMPOSE up -d db-roles keycloak-db
sleep 10
$COMPOSE ps -a --format '{{.Service}} {{.State}} exit={{.ExitCode}}'
```

Expected: `db running`, `db-roles exited exit=0`, `keycloak-db exited exit=0`. If a one-shot still shows `running`, wait and repeat the `ps` line; do not restore before both have exited. The one-shots create the roles `pflanzendex_owner` and `pflanzendex_app` and the sign-in role and database. `migrate` and `api` must not start yet: on an empty database they would create a schema before the restore.

## 6. Restore both dumps

```bash
CONFIRM=yes app/config/deploy/scripts/restore.sh "$APP_DUMP"
CONFIRM=yes app/config/deploy/scripts/restore.sh "$KC_DUMP"
```

`restore.sh` does the owner handling: the app dump is restored with `--no-owner --role=pflanzendex_owner`, so the objects belong to the schema owner and row-level security applies (P-04). The sign-in dump keeps its owner `keycloak`. Do not call `pg_restore` by hand: as the cluster user without `--role`, the objects would belong to the superuser again (see "DB roles in production" in `staging-deploy-and-backup.md`).

## 7. Start the rest of the stack with the 18 commit

```bash
git fetch --tags origin
app/config/deploy/scripts/deploy.sh "$SHA18"
```

`deploy.sh` backs up the restored database, passes the check (18 data, image 18), then runs `up -d --build`: `migrate` applies only migrations that the dump lacks (normally none), then `api`, `keycloak` and `proxy` start. The realm of the sign-in service is in the restored database and is not imported again. Health, master realm and smoke test follow. Check the one-shot:

```bash
$COMPOSE logs migrate | tail -2       # "Schema is up to date." or the applied files
```

## 8. Verify before users sign in again

```bash
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "show server_version"'      # 18.x
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -f -' < ~/pflanzendex-backups/counts.sql > ~/pflanzendex-backups/counts-pg18.txt
diff ~/pflanzendex-backups/counts-pg16.txt ~/pflanzendex-backups/counts-pg18.txt && echo "row counts identical"
$COMPOSE exec -T api wget -qO- http://127.0.0.1:3000/health/details                                     # checks.database "ok"
```

Expected: `18.x`, no diff, `checks.database` is `ok`. The API may write rows of its own at start (for example in the job queue), so a difference in such a table is expected; the rows that accounts own must match. Then run the two queries of "DB roles in production", checklist item 4: `pflanzendex_owner|f|f` and `0`. Last, sign in through the web app with an existing account and open one of your own records.

## 9. Afterwards

- Keep `pflanzendex_dbdata_pg16` and the 16 dumps until the new stack has run through a normal backup cycle. The owner decides when to remove them: `docker volume rm pflanzendex_dbdata_pg16`.
- `backup.sh` deletes dumps older than `BACKUP_RETENTION_DAYS` (14 by default); copy the 16 dumps elsewhere if you need them longer.

## Rollback

Use the rollback while no user has written data on 18 that you need to keep. Every write after step 7 is lost by the rollback; the 18 data stays in `pflanzendex_dbdata_pg18` for a manual check. A dump of 18 is not restored into 16 here: a dump written by 18 may contain statements that 16 cannot read, which has not been tested.

`deploy.sh` does not roll back across the major by itself. When a deploy of `SHA18` fails after the database has started, its automatic rollback to `SHA16` is refused by the check and the log ends with `ROLLBACK FAILED`. Then do the following by hand:

```bash
$COMPOSE stop api web keycloak
$COMPOSE down
docker volume create pflanzendex_dbdata_pg18
docker run --rm -v pflanzendex_dbdata:/from:ro -v pflanzendex_dbdata_pg18:/to alpine:3 cp -a /from/. /to/
docker volume rm pflanzendex_dbdata
docker volume create pflanzendex_dbdata
docker run --rm -v pflanzendex_dbdata_pg16:/from:ro -v pflanzendex_dbdata:/to alpine:3 cp -a /from/. /to/
app/config/deploy/scripts/deploy.sh "$SHA16"
```

If `pflanzendex_dbdata_pg18` exists already, choose a new name for the copy. If `pflanzendex_dbdata` does not exist, skip its copy and its removal. The check passes for `SHA16` because the image is 16 and the volume holds 16 data at its root. If the old version's smoke test fails because its helper scripts differ from the new `deploy.sh`, bridge it as described in "First deploy of a host on an old version" in `staging-deploy-and-backup.md`.

## Notes

- Sign-in service on PostgreSQL 18: Keycloak 26.8.0 (`quay.io/keycloak/keycloak:26.8.0`) started against a fresh database of `postgres:18.6-alpine` on 2026-10-30, imported the realms `master` and `pflanzendex` (101 tables created, no error in the log). This was checked with the compose stack on a development machine, not on the host. Still check the sign-in after step 7.
- The rehearsal of these steps on 2026-10-30 (development machine, throwaway stack): a 16 volume with the migrated schema and seed rows was backed up with `backup.sh`, the guard refused it for the 18 image, and after the copy, the one-shots and `restore.sh` the 53 tables had the same row counts. Both dumps are readable with the 18 client.
