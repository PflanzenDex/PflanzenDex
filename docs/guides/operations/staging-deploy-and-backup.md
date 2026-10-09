# Runbook: deploy staging, back up, restore

Ticket TE-03 (#40). Basis: E-01 (self-hosting, Docker Compose, one host), R-09, R-11, NFR-15, QG-S1. All files live in `app/config/deploy/`.

## Overview

| Service   | Job                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------- |
| `proxy`   | Caddy: HTTPS with an automatic certificate; `/health` and `/api/*` go to the API, the rest to web |
| `api`     | Hono API (Node 24, through tsx, because `core` is exported as TypeScript source)                  |
| `web`     | static PWA (Vite build, Caddy)                                                                    |
| `db`      | PostgreSQL 16, data in the `dbdata` volume                                                        |
| `migrate` | one-shot, same image as `api`: applies pending SQL migrations, then exits (#201)                  |

The database is not exposed. Only the proxy listens (ports from `HTTP_PORT`/`HTTPS_PORT`).

**Compression and caching (NFR-12):** the proxy compresses text responses (HTML, JS, CSS, JSON, SVG) with zstd or gzip, whichever `Accept-Encoding` asks for; Brotli would need a Caddy plugin and is not used. `web` sends `Cache-Control: public, max-age=31536000, immutable` for the hashed files under `/assets/` and `no-cache` (revalidate) for `index.html`, the service worker, the web manifest and SPA routes. The config is `app/config/deploy/proxy.Caddyfile` and `app/config/deploy/web.Caddyfile`; the test is `serving-headers.test.ts` in `app/packages/web/src/lib/test-setup/`.

## One-time setup (host)

1. Install Docker and Docker Compose, clone the repo.
2. `cp app/config/deploy/.env.example app/config/deploy/.env` and fill in the values (a long random password, `SITE_ADDRESS` = domain). The file is in `.gitignore`; secrets never go into the repo (QG-S1).
3. Schedule backups with cron or a timer, e.g. daily: `0 3 * * * cd /path/to/repo && make backup`.

## Deploy from `main`

```bash
make deploy          # fetches origin/main, backs up the DB (if it runs), builds, starts, waits for /health
```

To try another state: `app/config/deploy/scripts/deploy.sh origin/dev`. Builds are reproducible: `npm ci` from the lock file, base images pinned to major versions (`node:24-alpine`, `postgres:16-alpine`, `caddy:2-alpine`). `GET /health` shows the running version (`version` = commit hash).
Migrations run on every deploy: the one-shot `migrate` service (same image as `api`, `packages/db/migrations`) applies pending files before the `api` starts (`depends_on: service_completed_successfully`). They are forward only and guarded by an advisory lock and checksums. A failing migration fails `compose up`, so `deploy.sh` rolls back to the previous ref and the API never runs against a half-migrated schema. Check with `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml logs migrate`. Migrations are not rolled back; use the pre-deploy backup (restore below) for data problems. Manual run: `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml run --rm migrate`.
Rollback: `app/config/deploy/scripts/deploy.sh <earlier commit>`; for data problems, restore (below).

Trying it locally (without a domain): `.env` with `SITE_ADDRESS=localhost`, then `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml up -d --build` and `curl -k https://localhost:8443/health`.

## Backup

```bash
make backup          # app/config/deploy/backups/pflanzendex-<UTC time>.dump (pg_dump -Fc)
```

The script verifies the file with `pg_restore -l`, deletes backups older than `BACKUP_RETENTION_DAYS` and copies them to `BACKUP_REMOTE` with `rsync` if set (second location, R-11). An unreadable backup fails with an error (a backup that cannot be restored is an incident, NFR-15).

## Restore

```bash
# into a second database (safe, for checking):
app/config/deploy/scripts/restore.sh app/config/deploy/backups/<file>.dump pdx_check
# over the production database (overwrites it; stop the API first):
docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml stop api
CONFIRM=yes app/config/deploy/scripts/restore.sh app/config/deploy/backups/<file>.dump
docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml start api
```

## Restore test (NFR-15)

`make restore-test` starts a throwaway Postgres, creates 500 test rows, backs them up with `backup.sh`, restores them with `restore.sh` into a second database and compares row count and checksum. The production database stays untouched. Once a month, also run the "second database" path above on the host with a real backup and record the result.

Test log:

| Date       | Where                        | Result                                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | development machine (Docker) | `make restore-test` passed (500 rows, same checksum); backup and restore run against the Compose stack |

## Health check (US-DEV-09)

`GET /health` (no sign-in) answers with version, commit and `checks`:

| Field             | Values                                                                 | Meaning                                                                                                         |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `status`          | `ok`, `degraded`, `error`                                              | `error` (HTTP 503) when the database does not answer within 2 s (assumption); `degraded` (HTTP 200) for the job queue |
| `checks.database` | `ok`, `error`, `not_configured`                                        | `select 1` against the API's pool; the error text is never passed on                                            |
| `checks.jobs`     | `{ status: ok \| dead_jobs, queued, running, dead }`, `error`, `not_configured` | counts of the job queue (TE-06); `dead_jobs` = at least one job gave up with its error kept                      |
| `checks.storage`  | `configured`, `not_configured`                                         | whether the photo storage (S3) is set up; it is not called on every check                                       |

The Compose health check of `api` and `make deploy` use it: a 503 marks the container unhealthy and fails the deploy, which then rolls back. Monitoring should alert on `status != "ok"` and on HTTP 503.

## Runbooks for incidents (US-DEV-09)

Each runbook: what you see, what to check, what to do. Restoring a backup and the fallback to the previous version are above ("Restore") and in `release-and-rollback.md`.

### Migration fails

- **You see:** `make deploy` ends with an error at the `migrate` service; `deploy.sh` has rolled back to the previous ref, the old version keeps running.
- **Check:** `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml logs migrate` names the file and the SQL error. Migrations are forward only and run under an advisory lock, so a half-applied file is rolled back by its transaction.
- **Do:** fix the migration in a new PR (never edit an applied file: the checksum check refuses it), deploy again. If data was changed by hand meanwhile, take `make backup` first. Restore from the backup taken by the deploy only if the data itself is wrong.

### Database not reachable

- **You see:** `/health` answers 503 with `checks.database: "error"`; the API container is unhealthy.
- **Check:** `docker compose … ps db`, `docker compose … logs db` (disk full, crash loop, wrong password in `.env`).
- **Do:** free disk space or fix `.env`, `docker compose … up -d db`, wait for `/health` to answer 200. If the data volume is damaged: restore the latest backup (above).

### Dead jobs

- **You see:** `/health` answers `degraded` with `checks.jobs.status: "dead_jobs"`.
- **Check:** on the database, `select type, last_error, finished_at from job where status = 'dead' order by finished_at desc limit 20;` (owner role). Handlers are repeatable (US-QS-03).
- **Do:** fix the cause (external source down, bug), then order the job again through the feature that creates it (the queue merges duplicates). Old finished jobs are purged by the worker.

### Photo storage full or unavailable

- **You see:** photo uploads fail with `media.storage_unavailable` (HTTP 502); measurements are still saved without photo. `/health` shows `checks.storage: "configured"`, because the storage is not called on every check.
- **Check:** the S3 provider's console (quota, credentials, bucket); the `S3_*` variables of the API (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT`).
- **Do:** raise the quota or fix the credentials, restart `api`. Nothing has to be repaired in the database: a failed upload stores nothing (P-10).

### Security incident

- **You see:** a leaked secret (GitHub secret scanning, QG-S1), unusual sign-ins, or a report through `SECURITY.md`.
- **Do, in this order:** rotate the affected secret (database password in `.env` on the host, S3 keys) and restart the stack; if tokens may be affected, end all sessions at the sign-in service; take `make backup` and keep the logs; follow `SECURITY.md` for disclosure. Personal data affected: the operator has to decide about the notification duty (GDPR Art. 33, 72 hours).

**Open:** runbooks for the AI interface, reminders and the GDPR deletion follow with their features (KI, MON, US-ACC-04); operator messages for errors and dead jobs (NFR-18) and operating metrics (NFR-16) do not exist yet.

## Open (needs hardware, a domain or a decision)

None of this is done or made up:

- **Host:** the hardware for staging/production is not named yet; scripts and Compose were only checked locally.
- **Domain and DNS:** there is no public address. Needed: a domain, an A/AAAA record (dynamic DNS if the IP changes) or a tunnel, ports 80/443 forwarded to the host. Without these Caddy cannot get a public certificate. Reachability from outside over HTTPS (criterion from #40) is therefore **not** proven (R-11, spike TE-15).
- **Security updates:** set up automatic updates on the host (e.g. `unattended-upgrades`, reboot policy) and document them here.
- **Backup to a second location:** decide the target for `BACKUP_REMOTE` (second machine, external storage) and how the copy is encrypted. Photos/object storage are not backed up yet because they do not exist yet (TE-05).
- **Monitoring and alerts:** `/health` now reports database and job queue (see "Health check"); an external monitor that polls it and alerts, and a check of the backup age, are not set up yet (DEV-09, #172).
- **Image pins:** base images are pinned to major versions, not digests; Renovate (FR-QG-15) pins digests once it is active.
- **Migrations:** applied by the deploy itself (see above, #201). `deploy.sh` backs up before every deploy while the DB is running (DEV-07, #170); on the very first deploy there is no database to back up.
- **Sign-in service and invitation phase:** the stack has no Keycloak yet; closing self-registration and switching the registration mode on for a public deployment are described in `invitation-phase.md` (#301).
- **Confirmation:** `restore.sh` over the production database now expects `CONFIRM=yes` (was `CONFIRM=ja` before the tooling was translated).
