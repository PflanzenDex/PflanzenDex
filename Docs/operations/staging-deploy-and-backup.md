# Runbook: deploy staging, back up, restore

Ticket TE-03 (#40). Basis: E-01 (self-hosting, Docker Compose, one host), R-09, R-11, NFR-15, QG-S1. All files live in `app/deploy/`.

## Overview

| Service   | Job                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------- |
| `proxy`   | Caddy: HTTPS with an automatic certificate; `/health` and `/api/*` go to the API, the rest to web |
| `api`     | Hono API (Node 24, through tsx, because `core` is exported as TypeScript source)                  |
| `web`     | static PWA (Vite build, Caddy)                                                                    |
| `db`      | PostgreSQL 16, data in the `dbdata` volume                                                        |
| `migrate` | one-shot, same image as `api`: applies pending SQL migrations, then exits (#201)                  |

The database is not exposed. Only the proxy listens (ports from `HTTP_PORT`/`HTTPS_PORT`).

## One-time setup (host)

1. Install Docker and Docker Compose, clone the repo.
2. `cp app/deploy/.env.example app/deploy/.env` and fill in the values (a long random password, `SITE_ADDRESS` = domain). The file is in `.gitignore`; secrets never go into the repo (QG-S1).
3. Schedule backups with cron or a timer, e.g. daily: `0 3 * * * cd /path/to/repo && make backup`.

## Deploy from `main`

```bash
make deploy          # fetches origin/main, backs up the DB (if it runs), builds, starts, waits for /health
```

To try another state: `app/deploy/scripts/deploy.sh origin/dev`. Builds are reproducible: `npm ci` from the lock file, base images pinned to major versions (`node:24-alpine`, `postgres:16-alpine`, `caddy:2-alpine`). `GET /health` shows the running version (`version` = commit hash).
Migrations run on every deploy: the one-shot `migrate` service (same image as `api`, `packages/db/migrations`) applies pending files before the `api` starts (`depends_on: service_completed_successfully`). They are forward only and guarded by an advisory lock and checksums. A failing migration fails `compose up`, so `deploy.sh` rolls back to the previous ref and the API never runs against a half-migrated schema. Check with `docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml logs migrate`. Migrations are not rolled back; use the pre-deploy backup (restore below) for data problems. Manual run: `docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml run --rm migrate`.
Rollback: `app/deploy/scripts/deploy.sh <earlier commit>`; for data problems, restore (below).

Trying it locally (without a domain): `.env` with `SITE_ADDRESS=localhost`, then `docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml up -d --build` and `curl -k https://localhost:8443/health`.

## Backup

```bash
make backup          # app/deploy/backups/pflanzendex-<UTC time>.dump (pg_dump -Fc)
```

The script verifies the file with `pg_restore -l`, deletes backups older than `BACKUP_RETENTION_DAYS` and copies them to `BACKUP_REMOTE` with `rsync` if set (second location, R-11). An unreadable backup fails with an error (a backup that cannot be restored is an incident, NFR-15).

## Restore

```bash
# into a second database (safe, for checking):
app/deploy/scripts/restore.sh app/deploy/backups/<file>.dump pdx_check
# over the production database (overwrites it; stop the API first):
docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml stop api
CONFIRM=yes app/deploy/scripts/restore.sh app/deploy/backups/<file>.dump
docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml start api
```

## Restore test (NFR-15)

`make restore-test` starts a throwaway Postgres, creates 500 test rows, backs them up with `backup.sh`, restores them with `restore.sh` into a second database and compares row count and checksum. The production database stays untouched. Once a month, also run the "second database" path above on the host with a real backup and record the result.

Test log:

| Date       | Where                        | Result                                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | development machine (Docker) | `make restore-test` passed (500 rows, same checksum); backup and restore run against the Compose stack |

## Open (needs hardware, a domain or a decision)

None of this is done or made up:

- **Host:** the hardware for staging/production is not named yet; scripts and Compose were only checked locally.
- **Domain and DNS:** there is no public address. Needed: a domain, an A/AAAA record (dynamic DNS if the IP changes) or a tunnel, ports 80/443 forwarded to the host. Without these Caddy cannot get a public certificate. Reachability from outside over HTTPS (criterion from #40) is therefore **not** proven (R-11, spike TE-15).
- **Security updates:** set up automatic updates on the host (e.g. `unattended-upgrades`, reboot policy) and document them here.
- **Backup to a second location:** decide the target for `BACKUP_REMOTE` (second machine, external storage) and how the copy is encrypted. Photos/object storage are not backed up yet because they do not exist yet (TE-05).
- **Monitoring and alerts:** watching `/health` and backup age belongs to DEV-09 (#172).
- **Image pins:** base images are pinned to major versions, not digests; Renovate (FR-QG-15) pins digests once it is active.
- **Migrations:** applied by the deploy itself (see above, #201). `deploy.sh` backs up before every deploy while the DB is running (DEV-07, #170); on the very first deploy there is no database to back up.
- **Confirmation:** `restore.sh` over the production database now expects `CONFIRM=yes` (was `CONFIRM=ja` before the tooling was translated).
