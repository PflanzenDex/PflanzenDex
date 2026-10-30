# Runbook: deploy staging, back up, restore

Ticket TE-03 (#40). Basis: E-01 (self-hosting, Docker Compose, one host), R-09, R-11, NFR-15, QG-S1. All files live in `app/config/deploy/` (`docker/` holds the Dockerfiles and the web server config, `keycloak/` the realm and the database init).

## Overview

| Service       | Job                                                                                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy`       | Caddy: two hostnames (app, sign-in); plain HTTP behind a TLS-terminating proxy or HTTPS with automatic certificates; `/health` (status only) and `/api/*` (prefix removed) go to the API, `/health/*` and `/api/health/*` answer 404, the rest of the app host to web, the sign-in host to Keycloak |
| `api`         | Hono API (Node 24, through tsx, because `core` is exported as TypeScript source)                                                                                                                                                                                                                    |
| `web`         | static PWA (Vite build, Caddy)                                                                                                                                                                                                                                                                      |
| `db`          | PostgreSQL 18, data in the `dbdata` volume (upgrade from 16: `postgres-major-upgrade.md`)                                                                                                                                                                                                           |
| `migrate`     | one-shot, same image as `api`: applies pending SQL migrations, then exits (#201)                                                                                                                                                                                                                    |
| `keycloak`    | sign-in service (Keycloak 26.8, production mode), data in its own database in `db`; imports the realm `pflanzendex` on its first start                                                                                                                                                              |
| `db-roles`    | one-shot: creates the application role and the plain schema owner role, hands an existing database to it (#907, "DB roles in production")                                                                                                                                                           |
| `keycloak-db` | one-shot: creates the sign-in role and database in `db`, idempotently (also on an existing volume)                                                                                                                                                                                                  |
| `mailpit`     | test environment only (`docker-compose.test.yml`): catches the confirmation emails                                                                                                                                                                                                                  |

The database and Keycloak are not exposed. Only the proxy listens (ports from `HTTP_PORT`/`HTTPS_PORT`). Every service has a memory limit (starting values for a 3 GB host, assumptions; see "Memory" below) and keeps at most 3 log files of 10 MB (`json-file` driver, anchor `x-logging`; the overlays repeat it; starting values, assumption), so a noisy client cannot fill the disk. The API limits writes per client (120 per minute, 429 `request.rate_limited`; `docs/guides/reference/app.md`). The limit applies when a container is created: `docker compose up -d` recreates the services with the new setting; `docker inspect --format '{{.HostConfig.LogConfig}}' <container>` shows it.

**Compression and caching (NFR-12):** the proxy compresses text responses (HTML, JS, CSS, JSON, SVG) with zstd or gzip, whichever `Accept-Encoding` asks for; Brotli would need a Caddy plugin and is not used. `web` sends `Cache-Control: public, max-age=31536000, immutable` for the hashed files under `/assets/` and `no-cache` (revalidate) for `index.html`, the service worker, the web manifest and SPA routes. The config is `app/config/deploy/proxy.Caddyfile` and `app/config/deploy/docker/web.Caddyfile`; the test is `serving-headers.test.ts` in `app/packages/web/src/lib/test-setup/`.

## One-time setup (host)

1. Install Docker and Docker Compose, clone the repo.
2. `cp app/config/deploy/.env.example app/config/deploy/.env` and fill in the values (long random passwords, `APP_URL`/`AUTH_URL` and `APP_HOST`/`AUTH_HOST` = the two public addresses, `KEYCLOAK_*`, `SMTP_*`; the template explains each). The file is in `.gitignore`; secrets never go into the repo (QG-S1).
3. Schedule backups with cron or a timer, e.g. daily: `0 3 * * * cd /path/to/repo && make backup`.

## Deploy from `main`

```bash
make deploy          # fetches origin/main, backs up the DB (if it runs), builds, starts, waits for /health
```

To try another state: `app/config/deploy/scripts/deploy.sh origin/dev`. Builds are reproducible: `npm ci` from the lock file, base images pinned to major versions (`node:24-alpine`, `postgres:18-alpine`, `caddy:2-alpine`). A PostgreSQL major is never taken over by Renovate; the upgrade is the one-time runbook `postgres-major-upgrade.md`. `GET /health/details` (inside the stack, see "Health check") shows the running version (`version` = commit hash).
Migrations run on every deploy: the one-shot `migrate` service (same image as `api`, `packages/db/migrations`) applies pending files before the `api` starts (`depends_on: service_completed_successfully`). They are forward only and guarded by an advisory lock and checksums. A failing migration fails `compose up`, so `deploy.sh` rolls back to the previous ref and the API never runs against a half-migrated schema. Check with `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml logs migrate`. Migrations are not rolled back; use the pre-deploy backup (restore below) for data problems. Manual run: `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml run --rm migrate`.
Rollback: `app/config/deploy/scripts/deploy.sh <earlier commit>`; for data problems, restore (below). Across a PostgreSQL major the automatic rollback is refused by the volume check; the steps are in `postgres-major-upgrade.md`.

Trying it locally (without a domain): `.env` with `CADDY_SCHEME=` (empty), `APP_HOST=localhost`, `AUTH_HOST=auth.localhost`, `APP_URL=https://localhost:8443`, `AUTH_URL=https://auth.localhost:8443`, then `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml up -d --build` and `curl -k https://localhost:8443/health`.

## Realm security defaults (#757)

The deployment realm is stricter than the development realm, because anyone may register on a public installation. The development realm keeps `length(10)` and its long sessions, so its test users and their passwords stay valid.

| Setting                                                      | Deployment realm                                             | Why                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `passwordPolicy`                                             | `length(12) and maxLength(128) and notUsername and notEmail` | at least 12 characters (starting value, assumption); Keycloak shows its own German messages ("muss mindestens 12 Zeichen beinhalten") |
| `ssoSessionIdleTimeout` / `ssoSessionMaxLifespan`            | 1 day / 7 days                                               | a forgotten session on a shared device ends after a day without use (starting values, assumption)                                     |
| `ssoSessionIdleTimeoutRememberMe` / `…MaxLifespanRememberMe` | 7 days / 30 days                                             | "Angemeldet bleiben" on the own phone: sign in again at the latest after a month (starting values, assumption)                        |
| `eventsEnabled`, `eventsExpiration`                          | on, 30 days                                                  | failed and successful sign-ins can be traced after an incident; they hold IP addresses, so they expire (assumption)                   |
| `adminEventsEnabled`, `adminEventsDetailsEnabled`            | on, without details                                          | every change in the admin console is logged; the details would copy whole representations into the log                                |

A list of forbidden passwords (`passwordBlacklist`) needs a file inside the Keycloak container and is not set yet. Whether self-registration stays on is decided per installation (test: on; invitation phase: off, `invitation-phase.md`).

**Existing realm.** The realm file is imported only on the first start (`IGNORE_EXISTING`), so apply the change to a running installation with `kcadm.sh` (checked on 2026-10-20 with Keycloak 26.8.0: afterwards the realm has the same values as a fresh import):

```bash
c="docker compose --env-file app/config/deploy/.env exec -T keycloak /opt/keycloak/bin/kcadm.sh"
docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user <admin>
$c update realms/pflanzendex \
  -s 'passwordPolicy=length(12) and maxLength(128) and notUsername and notEmail' \
  -s ssoSessionIdleTimeout=86400 -s ssoSessionMaxLifespan=604800 \
  -s ssoSessionIdleTimeoutRememberMe=604800 -s ssoSessionMaxLifespanRememberMe=2592000
$c update events/config -r pflanzendex \
  -s eventsEnabled=true -s eventsExpiration=2592000 -s adminEventsEnabled=true -s adminEventsDetailsEnabled=false
$c get realms/pflanzendex --fields passwordPolicy,ssoSessionIdleTimeout,ssoSessionMaxLifespan,eventsEnabled
```

`config credentials` asks for the password interactively (QG-S1). The new password policy applies to passwords set from now on; existing passwords stay valid until they are changed. Running sessions keep their old limits until they end.

## Backup

```bash
make backup          # $BACKUP_DIR/pflanzendex-<UTC time>.dump and keycloak-<UTC time>.dump (pg_dump -Fc)
```

`BACKUP_DIR` defaults to `~/pflanzendex-backups`, outside the repository: the dumps hold password hashes and the realm keys, and a folder inside the checkout could be committed by a `git add -A` on the host (#760). The script runs with `umask 077`, so the folder is 0700 and every dump 0600; dumps of earlier runs are tightened to 0600 on the next run. `.gitignore` also ignores the old folder `app/config/deploy/backups/` and every `*.dump`. A host whose `.env` still says `BACKUP_DIR=./backups` keeps working; move the folder and the setting when convenient (`mv app/config/deploy/backups ~/pflanzendex-backups`, then `BACKUP_DIR=${HOME}/pflanzendex-backups` in `.env`).

Each run writes two files when the sign-in service exists: `pflanzendex-*.dump` (app data) and `keycloak-*.dump` (identities, sessions, realm settings; without it nobody could sign in after a restore). The script verifies the file with `pg_restore -l`, deletes backups older than `BACKUP_RETENTION_DAYS` and copies them to `BACKUP_REMOTE` with `rsync` if set (second location, R-11). An unreadable backup fails with an error (a backup that cannot be restored is an incident, NFR-15).

## Restore

```bash
# into a second database (safe, for checking):
app/config/deploy/scripts/restore.sh ~/pflanzendex-backups/<file>.dump pdx_check
# over the production database (overwrites it; stop the API first; a keycloak-*.dump goes into the sign-in database,
# stop `keycloak` first instead):
docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml stop api
CONFIRM=yes app/config/deploy/scripts/restore.sh ~/pflanzendex-backups/<file>.dump
docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml start api
```

## Restore test (NFR-15)

`make restore-test` starts a throwaway Postgres, creates 500 test rows, backs them up with `backup.sh`, restores them with `restore.sh` into a second database and compares row count and checksum. The production database stays untouched. Once a month, also run the "second database" path above on the host with a real backup and record the result.

Test log:

| Date       | Where                        | Result                                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | development machine (Docker) | `make restore-test` passed (500 rows, same checksum); backup and restore run against the Compose stack |

## Test environment behind a reverse proxy

Goal: a self-contained test environment with sign-in on one x86_64 Linux host (for example an LXC container with Docker, 2 cores, 3 GB RAM). TLS ends at a reverse proxy in front of the host; it forwards plain HTTP to the host's port 80 and sets `X-Forwarded-Proto`, `X-Forwarded-For` and `X-Forwarded-Host`. Two public hostnames point at the proxy (placeholders below, use your own): `app.example.test` (web, `/api`, `/health`) and `auth.example.test` (sign-in service, and the mail catcher under `/mail/`).

```text
browser --https--> upstream proxy --http :80--> proxy (Caddy) --+--> web          app.example.test/
                                                                |--> api          app.example.test/api/*, /health
                                                                |--> keycloak     auth.example.test/
                                                                `--> mailpit      auth.example.test/mail/   (test only)
```

How it fits together:

- **One variable picks the mode.** `CADDY_SCHEME=http://` makes Caddy serve both hostnames on plain HTTP :80 without certificates (this setup). Empty makes Caddy get its own certificates (host facing the internet). Forwarded headers are believed only from `TRUSTED_PROXIES` (the upstream proxy's address); from anyone else they are overwritten. Keycloak builds its public links from them (`KC_PROXY_HEADERS=xforwarded`) and from `KC_HOSTNAME` (= `AUTH_URL`), so make the upstream proxy pass `X-Forwarded-Proto: https`.
- **Keycloak** (`quay.io/keycloak/keycloak:26.8.1`, same as `make auth-up`) runs in production mode (`start`) with HTTP enabled inside the network. Its data lives in its own database `keycloak` with its own role in the existing `db` service (a second PostgreSQL would cost 100+ MB of the scarce memory). The one-shot `keycloak-db` creates role and database idempotently on every `up`, also on an existing volume, and revokes `CONNECT` on the app database from everyone but the cluster user: the sign-in role cannot reach tenant data (P-04). Port 8080 is published only on the host's loopback (`127.0.0.1:${KEYCLOAK_ADMIN_PORT}`, default 8180) for the admin console over an SSH tunnel (see "Admin console over an SSH tunnel"); the management port 9000 is not published.
- **Realm** `pflanzendex` is imported on the first start from `app/config/deploy/keycloak/pflanzendex-realm.json`. It matches the development realm (clients `pflanzendex-api` and `pflanzendex-web` with S256 PKCE, audience mapper, `fullScopeAllowed: false`, access token 5 minutes (ADR 0009), login theme `pflanzendex`, email verification, self-registration) and differs in four ways: no test users, redirect addresses and web origin come from `APP_URL` (placeholder `${WEB_BASE_URL}`), SMTP comes from `SMTP_*` (placeholders `${KC_SMTP_*}`), and stronger security defaults (see "Realm security defaults" below). Checked on 2026-10-11 with Keycloak 26.8.0: string placeholders (also inside arrays and empty values) are resolved; for booleans they are not reliable (see `invitation-phase.md`), which is why `registrationAllowed` stays a command, not a placeholder. **A changed realm file does not touch an existing realm** (`IGNORE_EXISTING`): change a live realm in the admin console or with `kcadm.sh`; to re-import, drop the `keycloak` database (`docker compose ... stop keycloak`, then drop and re-run `up`) and lose its accounts.
- **API settings.** `OIDC_ISSUER` is the public issuer (`${AUTH_URL}/realms/pflanzendex`), because tokens carry it in `iss`. The API does not fetch keys through that public address (that would need the host to reach its own proxy and TLS): `OIDC_JWKS_URL=http://keycloak:8080/realms/pflanzendex/protocol/openid-connect/certs` points the key fetch inside the network, while signature, issuer and audience (`OIDC_AUDIENCE=pflanzendex-api`) are still checked as before (test `token.test.ts`, TE-03). `WEB_ORIGIN=${APP_URL}` sets CORS; `AI_RESOURCE_URL=${APP_URL}/api/mcp`.
- **Web build.** `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` and `VITE_API_URL=${APP_URL}/api` are build arguments of `web.Dockerfile` (Vite compiles them into the bundle), so changing `APP_URL` or `AUTH_URL` needs a rebuild (`make deploy` does it). The API is reached under `/api` on the same origin, so there is no cross-origin call; the proxy removes the `/api` prefix.
- **Mail.** The realm requires email confirmation. `docker-compose.test.yml` adds Mailpit (no ports published) and a Caddy route to its UI at `https://auth.example.test/mail/` behind basic auth (`MAIL_UI_USER`, `MAIL_UI_HASH`, see "Public test environment through Tailscale Funnel"); the realm sends to it by default. It shows every email, so it must exist only in the test environment. Production sets `SMTP_*` in `.env` and does not load the overlay.

### One-time setup

1. Install Docker and the Compose plugin, clone the repo, check out `dev`.
2. Configure the upstream proxy: both hostnames to `http://<host>:80`, WebSocket not needed, forward `Host`, `X-Forwarded-Proto: https`, `X-Forwarded-For`. Note the proxy's address as seen from the host.
3. `cp app/config/deploy/.env.example app/config/deploy/.env` and set at least:

   | Variable                                                                                    | Value                                                                                                          |
   | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
   | `POSTGRES_PASSWORD`, `DB_OWNER_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD` | four different random values, e.g. `openssl rand -hex 24` (hex only: the scripts source the file)              |
   | `APP_URL`, `AUTH_URL`                                                                       | `https://app.example.test`, `https://auth.example.test` (what the browser shows, no trailing slash)            |
   | `APP_HOST`, `AUTH_HOST`                                                                     | `app.example.test`, `auth.example.test`                                                                        |
   | `CADDY_SCHEME`                                                                              | `http://`                                                                                                      |
   | `TRUSTED_PROXIES`                                                                           | the upstream proxy's address(es) as CIDR, space separated, e.g. `192.0.2.10/32`                                |
   | `COMPOSE_FILE`                                                                              | `docker-compose.yml:docker-compose.test.yml` (adds Mailpit; `deploy.sh`, `backup.sh` and `restore.sh` read it) |

   `POSTGRES_USER`, `POSTGRES_DB`, `KEYCLOAK_ADMIN_USER` have defaults in the template; `SMTP_*`, `KEYCLOAK_DB_NAME`, `KEYCLOAK_DB_USER`, `KEYCLOAK_JAVA_HEAP`, `HTTP_PORT`, `BACKUP_*` are optional (all listed in `.env.example`). The file is in `.gitignore`; no secret goes into the repo (QG-S1). Never write real hostnames or addresses into the repo either: it is public.

4. Schedule backups, e.g. `0 3 * * * cd /path/to/repo && make backup`.

### First start

```bash
app/config/deploy/scripts/deploy.sh origin/dev      # fetches, backs up (if db runs), builds, starts, waits for api and keycloak, smoke test
```

The first start takes a few minutes on 2 cores (image builds, then Keycloak builds its optimized runtime and imports the realm, about 30 to 60 seconds). Check from the host (replace the hostnames; the `Host` header and `X-Forwarded-Proto` imitate the upstream proxy):

```bash
curl -s -H 'Host: app.example.test' -H 'X-Forwarded-Proto: https' http://127.0.0.1/health
curl -s -H 'Host: auth.example.test' -H 'X-Forwarded-Proto: https' http://127.0.0.1/realms/pflanzendex/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
# expected issuer: https://auth.example.test/realms/pflanzendex
```

Note: `deploy.sh` checks out the ref in the checkout (detached HEAD). Every deploy is a deliberate, manual step (E-14); from GitHub it is the workflow `deploy.yml` (see "Deploying with GitHub Actions (TE-19)").

### First account and the operator role

1. Open `https://app.example.test`, press the sign-in button and choose register (self-registration is on in the test environment). Keycloak asks for email confirmation.
2. Open `https://auth.example.test/mail/` (the mail catcher), open the email and follow the link; set the password (at least 12 characters, not the username or the email address). Sign in; the first sign-in creates the account.
3. Make the account the operator: follow `invitation-phase.md` steps 4 to 5. The subject is the Keycloak user id (`kcadm.sh get users -r pflanzendex -q email=<email> --fields id`; the admin console `/admin/` is blocked on the public name; open it over an SSH tunnel, see "Admin console over an SSH tunnel"). `compose` there stands for `docker compose --env-file app/config/deploy/.env`; the compose files come from `COMPOSE_FILE`, so no `-f` is needed. The tab "Betreiber" appears after a reload.

### Closing self-registration

Registration is a per-installation switch, not part of the build (`invitation-phase.md`). When the test environment should accept only invited people: realm switch `docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin` (asks for the password), then `... kcadm.sh update realms/pflanzendex -s registrationAllowed=false`; and the app switch "nur mit Einladungscode" in the operator area. Both layers and the consequence (the operator creates the identities) are described in `invitation-phase.md`. To reopen: `-s registrationAllowed=true`.

### Deploy and update

`app/config/deploy/scripts/deploy.sh origin/dev` (backup first, migrations through the one-shot `migrate`, rollback to the previous ref if the api or Keycloak does not become healthy or the smoke test fails). With `CADDY_SCHEME=http://` the smoke test calls `http://127.0.0.1:$HTTP_PORT` with the `Host` header of `APP_HOST`; set `SMOKE_URL` to test through the public address instead. A Keycloak image update is a change of the tag in `docker-compose.yml` (keep it equal to `app/config/dev/compose.yaml`).

### Backup and restore

`make backup` writes `pflanzendex-*.dump` and `keycloak-*.dump` (see "Backup"). Restore the sign-in database into a check database: `app/config/deploy/scripts/restore.sh ~/pflanzendex-backups/keycloak-<time>.dump kc_check`; over the live one: stop `keycloak`, `CONFIRM=yes app/config/deploy/scripts/restore.sh ~/pflanzendex-backups/keycloak-<time>.dump`, start `keycloak`. The restored objects keep their owner (the `keycloak` role). Restore app and sign-in dump from the same run so account subjects and identities match. `make restore-test` covers both databases.

### Memory

Limits in `docker-compose.yml` are starting values for a 3 GB host (assumptions): `db` 256 MB, `keycloak` 900 MB (JVM heap `-Xms128m -Xmx512m`), `api` 512 MB, `migrate` 512 MB (only while it runs), `web` 96 MB, `proxy` 64 MB, `mailpit` 64 MB, `keycloak-db` 64 MB (only while it runs). Measured on 2026-10-11 on a development machine (not the target host) after the first requests, one registered account (`docker stats --no-stream`):

| Container  | Memory used   | Limit  |
| ---------- | ------------- | ------ |
| `keycloak` | 522 MiB       | 900 MB |
| `api`      | 116 MiB       | 512 MB |
| `db`       | 76 MiB        | 256 MB |
| `web`      | 43 MiB        | 96 MB  |
| `mailpit`  | 41 MiB        | 64 MB  |
| `proxy`    | 16 MiB        | 64 MB  |
| total      | about 815 MiB | 1.9 GB |

That leaves room on a 3 GB host for the OS, Docker and image builds (`vite build` and `npm ci` need a few hundred MB while they run; build on the host only when nothing else peaks, or add swap). Keycloak's first start peaks higher than its idle figure; the 900 MB limit was not hit in the local run. Recheck on the real host.

Test log (test environment):

| Date       | Where                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | development machine (Docker Compose) | Stack with Keycloak and Mailpit started. Through port 80 with `Host` and `X-Forwarded-Proto: https`: `/health` ok, web served (zstd, `no-cache`), discovery document with the public https issuer, Mailpit UI at `/mail/`, verification email link on the public address, password-grant token accepted by `GET /api/account` (issuer public, keys fetched inside), foreign redirect address refused (400). Backup wrote both dumps; restore into check databases and over the live sign-in database worked, sign-in still worked afterwards. `make restore-test` passed for both databases. Not covered: the real upstream proxy, the browser flow, the target host. The development machine's bridge networking was broken (veth module missing), so the run used host networking with a local override outside the repo. |

## Public test environment through Tailscale Funnel

Goal: make the test environment reachable from the public internet without a reverse proxy, without an inbound port and without a domain, for a host that only has outbound internet (for example an unprivileged LXC container without `/dev/net/tun`). Visitors need no VPN and no Tailscale account. Overlay: `app/config/deploy/docker-compose.funnel.yml`, serve config: `app/config/deploy/docker/tailscale/serve.json`. Checked statically by `deploy-config.test.ts` (TE-03).

```text
browser --https--> Tailscale edge --relay (does not decrypt)--> ts-app / ts-auth (tailscaled, TLS ends here)
                                                                      |--http :80 (Docker network)--> proxy (Caddy) --> web, api, keycloak, mailpit
```

- **Two public names, two Tailscale nodes.** `ts-app` (name `TS_APP_NAME`) serves the app, `ts-auth` (name `TS_AUTH_NAME`) serves the sign-in service. Each runs `tailscale/tailscale` (exact tag pinned in the overlay) in userspace networking (`TS_USERSPACE=true`): no tun device, no capabilities, only outbound connections. State lives in the volumes `tsstate-app` and `tsstate-auth`; without them every restart would register a new node and use up the name. The public names are `<TS_APP_NAME>.<tailnet>.ts.net` and `<TS_AUTH_NAME>.<tailnet>.ts.net` (below: `app.example-tailnet.ts.net` and `auth.example-tailnet.ts.net`).
- **Serve config.** Both nodes load the same `serve.json`: HTTPS on 443, `AllowFunnel` for `${TS_CERT_DOMAIN}:443` (the container replaces the variable with its own name), everything proxied to `http://proxy:80`. 443 is the only Funnel port in use (Funnel also allows 8443 and 10000).
- **Caddy stays in plain HTTP mode** (`CADDY_SCHEME=http://`) and routes by `Host`: the two site blocks are keyed by `APP_HOST` and `AUTH_HOST`, which are now the `ts.net` names. tailscaled's serve proxy forwards the original `Host` and adds `X-Forwarded-For` (the visitor), `X-Forwarded-Proto: https` and `X-Forwarded-Host`; Keycloak builds its https links from `KC_HOSTNAME` (= `AUTH_URL`) and these headers. This header behavior comes from the tailscaled source and was **not** observed on the real host yet; check it once after the first start (see "Verify" below).
- **Trusted proxies.** The overlay pins the stack network to `172.29.40.0/24` and the two Tailscale nodes to `172.29.40.2` and `172.29.40.3`; `TRUSTED_PROXIES=172.29.40.2/32 172.29.40.3/32`. Only from these two addresses Caddy believes `X-Forwarded-*`; from anyone else (another container on the network) it overwrites them. If the subnet collides with another network on the host, change it in the overlay and in `TRUSTED_PROXIES` together (the test `deploy-config.test.ts` expects the documented values).
- **Nothing public on the host.** The overlay drops the base file's mappings for ports 80 and 443 (`ports: !override`) and publishes only `127.0.0.1:${HTTP_PORT}:80`. That loopback port is what `deploy.sh` needs for its smoke test (`http://127.0.0.1:$HTTP_PORT` with the `Host` header of `APP_HOST`), so `deploy.sh` needs no change. Check with `ss -ltn`: nothing but `127.0.0.1:80` (and SSH) may listen.
- **Path blocks live in the base `proxy.Caddyfile`**, not in an overlay: the sign-in host answers 404 for `/admin*`, `/realms/master*`, `/metrics*` and `/health*`. Production behind a TLS proxy or with its own certificates faces the same internet, and with an overlay a forgotten `COMPOSE_FILE` would silently expose the admin console. The login pages need only `/realms/pflanzendex/*`, `/resources/*` and `/js/*`, which stay open (also `/realms/pflanzendex/account` and the registration page). Management port 9000 is not routed at all.
- **Mail catcher UI** `https://auth.example-tailnet.ts.net/mail/` shows every email of the realm, so it is behind HTTP basic auth (`basic_auth` in `proxy.mail.caddy`, user `MAIL_UI_USER`, bcrypt hash `MAIL_UI_HASH`). Testers need it to read their confirmation email: give them the user and password through a separate channel. Without both variables `docker-compose.test.yml` refuses to start (`:?`).

### One-time Tailscale steps

1. Create a Tailscale account (free plan is enough) and note the tailnet name (`<tailnet>.ts.net`, admin console, DNS).
2. Admin console, DNS: enable **MagicDNS** and **HTTPS certificates**. Optionally rename the tailnet to something neutral (the name is public in the URLs).
3. Access controls (policy file): declare the tag and allow your admin to own it, and grant the `funnel` node attribute to it:

   ```json
   {
     "tagOwners": { "tag:pflanzendex-funnel": ["autogroup:admin"] },
     "nodeAttrs": [{ "target": ["tag:pflanzendex-funnel"], "attr": ["funnel"] }]
   }
   ```

   (Merge into the existing policy. `autogroup:member` gets `funnel` by default; the explicit rule keeps it to the tagged nodes if you restrict it later.) The tagged nodes need no other access rule: they accept no tailnet traffic.

4. Settings, Keys, **Generate auth key**: reusable (two nodes register with it), pre-approved, **not ephemeral**, tag `tag:pflanzendex-funnel`, **expiry 1 day**. Copy it into `.env` as `TS_AUTHKEY` and treat it as a secret. The key is needed only to register the nodes; later starts use the state volumes (`tsstate-app`, `tsstate-auth`). Whoever holds a valid key can register further nodes with the tag, and with it the Funnel right, in your tailnet; so after the first start (step 5) delete the `TS_AUTHKEY` line from `.env`, recreate the two nodes so the key leaves their environment (`docker compose --env-file app/config/deploy/.env up -d ts-app ts-auth`; `docker inspect` must no longer show it), and revoke the key in the admin console. A key is needed again only if a state volume is lost.
5. After the first start check in the admin console (Machines) that both nodes carry the tag and that their key expiry is disabled (tagged nodes have none by default); otherwise they drop out after the key lifetime.

### `.env` for Funnel

Start from `.env.example`; in addition to the variables of "Test environment behind a reverse proxy" set:

| Variable                       | Value                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`, `AUTH_URL`          | `https://app.example-tailnet.ts.net`, `https://auth.example-tailnet.ts.net`                                             |
| `APP_HOST`, `AUTH_HOST`        | the same names without scheme                                                                                           |
| `CADDY_SCHEME`                 | `http://`                                                                                                               |
| `TRUSTED_PROXIES`              | `172.29.40.2/32 172.29.40.3/32`                                                                                         |
| `TS_AUTHKEY`                   | the auth key from step 4, only until both nodes are registered (then delete the line and revoke the key)                |
| `TS_APP_NAME`, `TS_AUTH_NAME`  | `app`, `auth` (first labels of the public names; choose names that fit your tailnet, they become public)                |
| `TS_TAG`                       | optional, default `tag:pflanzendex-funnel` (must be a tag of the auth key)                                              |
| `MAIL_UI_USER`, `MAIL_UI_HASH` | user and bcrypt hash, see below                                                                                         |
| `COMPOSE_FILE`                 | `docker-compose.yml:docker-compose.test.yml:docker-compose.funnel.yml` (read by `deploy.sh`, `backup.sh`, `restore.sh`) |

Create the mail hash (no Caddy install needed) and keep the single quotes in `.env`; the hash contains `$`, which the shell scripts and Compose would otherwise expand:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'the-password'
# .env:  MAIL_UI_HASH='$2a$14$...'
```

### First start and verify

```bash
app/config/deploy/scripts/deploy.sh origin/dev
docker compose --env-file app/config/deploy/.env logs ts-app ts-auth | tail     # "Funnel on: https://..."
```

The first sign-in of a node fetches a certificate from Let's Encrypt (a few seconds). Then, from any machine outside (phone on mobile data):

```bash
curl -s https://app.example-tailnet.ts.net/health
curl -s https://auth.example-tailnet.ts.net/realms/pflanzendex/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
curl -s -o /dev/null -w '%{http_code}\n' https://auth.example-tailnet.ts.net/admin/        # 404
curl -s -o /dev/null -w '%{http_code}\n' https://auth.example-tailnet.ts.net/mail/         # 401
```

If the app answers 404 or the issuer shows `http://`, the forwarded headers are not as described above: temporarily add `log` to the site blocks of `proxy.Caddyfile` on the host (do not commit it), read `docker compose logs proxy` and report what `Host` and `X-Forwarded-*` look like.

Then register the first account and follow "First account and the operator role" with these differences: the admin console is **not** reachable on the public name; use the SSH tunnel ("Admin console over an SSH tunnel" below) or `kcadm.sh` ("Operator work without the admin console"). The mail catcher is `https://auth.example-tailnet.ts.net/mail/` with the basic-auth login.

### Switching an existing installation to the Funnel names

`APP_URL`/`AUTH_URL` are compiled into the web bundle (rebuild) and the realm is imported only once (`IGNORE_EXISTING`), so its redirect addresses still name the old host. Either:

1. **Update the live realm** (keeps accounts). After setting the new `.env` and running `deploy.sh` (it rebuilds `web`):

   ```bash
   c="docker compose --env-file app/config/deploy/.env"
   $c exec keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin   # asks for the password
   id=$($c exec keycloak /opt/keycloak/bin/kcadm.sh get clients -r pflanzendex -q clientId=pflanzendex-web --fields id --format csv --noquotes | tr -d '\r')
   $c exec keycloak /opt/keycloak/bin/kcadm.sh update "clients/$id" -r pflanzendex \
     -s rootUrl=https://app.example-tailnet.ts.net \
     -s 'redirectUris=["https://app.example-tailnet.ts.net/*"]' \
     -s 'webOrigins=["https://app.example-tailnet.ts.net"]' \
     -s 'attributes."post.logout.redirect.uris"=https://app.example-tailnet.ts.net/*'
   ```

   Existing sessions and tokens carry the old issuer, so everyone signs in again.

2. **Start the sign-in database over** when no accounts exist yet (the realm is imported with the new values): `docker compose ... stop keycloak`, then

   ```bash
   $c exec db psql -U "$POSTGRES_USER" -d postgres -c 'DROP DATABASE keycloak'     # name from KEYCLOAK_DB_NAME
   $c up -d keycloak-db keycloak
   ```

   (`keycloak-db` creates the empty database again; the bootstrap admin is created again from `KEYCLOAK_ADMIN_*`.) This loses all accounts and sessions.

### Admin console over an SSH tunnel

**Why `/admin/` answers 404 on the public name.** `proxy.Caddyfile` blocks `/admin*`, `/realms/master*`, `/metrics*` and `/health*` on the sign-in host. The admin console controls every account and the realm settings; on a public name anyone could try passwords against it. The block lives in the base Caddyfile, so it applies to every installation, not only the test environment.

**How the console is reached instead.** Keycloak gives the admin console and the master realm their own address, `KC_HOSTNAME_ADMIN=http://localhost:${KEYCLOAK_ADMIN_PORT}` (default port 8180), and publishes its HTTP port on the host's loopback only (`127.0.0.1:8180`). Nothing on the network can reach that port; only someone who can log in to the host over SSH can forward it. The public issuer (`AUTH_URL/realms/pflanzendex`) and the login pages stay unchanged.

1. On your workstation, open the tunnel (keeps running in that terminal):

   ```bash
   ssh -N -L 8180:127.0.0.1:8180 <host>
   ```

2. Open `http://localhost:8180/admin/master/console/` in the browser on that workstation.
3. Log in as `KEYCLOAK_ADMIN_USER` (default `admin`) with `KEYCLOAK_ADMIN_PASSWORD` from `app/config/deploy/.env` on the host. Read it there without copying the file anywhere: `ssh <host> "grep '^KEYCLOAK_ADMIN_PASSWORD=' <repo>/app/config/deploy/.env | cut -d= -f2"`. After the first start, hand the master realm over to a named admin with a second factor (see "Master realm and admin handover").
4. Close the tunnel with Ctrl+C when done.

If port 8180 is taken on the host or the workstation, set `KEYCLOAK_ADMIN_PORT` in `.env`, redeploy, and use the same number on both sides of `-L`. The local port in the browser must equal `KEYCLOAK_ADMIN_PORT`, because Keycloak builds the console's links from it.

### Operator work without the admin console

Everything the console does also works on the command line inside the container, without a tunnel: `docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh ...` (log in first with `kcadm.sh config credentials --server http://localhost:8080 --realm master --user <admin>`, as in "Closing self-registration"; after the handover `<admin>` is the named admin). The operator role steps of `invitation-phase.md` use `kcadm.sh get users` and need no console.

### Master realm and admin handover (#758)

The master realm controls every realm. It is blocked on the public name, but every container on the stack network reaches Keycloak directly, so it needs a lockout of its own.

**Brute-force protection.** `deploy.sh` runs `app/config/deploy/keycloak/master-realm.sh` after Keycloak is healthy. It signs in as the bootstrap admin with the credentials the container already has (`KC_BOOTSTRAP_ADMIN_*`, no password on the host's command line) and sets `bruteForceProtected=true` and `failureFactor=5` (as in the app realm; starting value, assumption) in the master realm, every time, idempotently. So a fresh installation ends with the protection on. After the handover below the bootstrap admin no longer exists: the script prints `master realm: the bootstrap admin cannot sign in ...` and the deploy goes on; from then on the named admin owns the setting (check it in step 4).

**Hand over the bootstrap admin.** The bootstrap admin (`KEYCLOAK_ADMIN_USER`, default `admin`) is a permanent user with a password only. Replace it with a named admin who needs a one-time code (TOTP), once per installation:

1. Create the named admin as the bootstrap admin (the `config credentials` line asks for `KEYCLOAK_ADMIN_PASSWORD` interactively, QG-S1; `set-password` without `--new-password` asks too):

   ```bash
   c="docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh"
   $c config credentials --server http://localhost:8080 --realm master --user admin
   $c create users -r master -s username=<name> -s email=<email> -s emailVerified=true -s enabled=true \
     -s 'requiredActions=["CONFIGURE_TOTP"]'
   $c set-password -r master --username <name>
   $c add-roles -r master --uusername <name> --rolename admin
   ```

2. Open the admin console over the SSH tunnel (above) and sign in as `<name>`. Keycloak asks to set up the authenticator app right away (`CONFIGURE_TOTP`). Sign out and in again to check that the code is asked for.
3. As `<name>`, in the console: realm `master` > Users > `admin` > Delete. (With kcadm: `$c get users -r master -q username=admin -q exact=true --fields id`, then `$c delete users/<id> -r master`.)
4. Still as `<name>`: realm `master` > Realm settings > Security defenses > Brute force detection is on ("Lockout temporarily", 5 failures).
5. Replace `KEYCLOAK_ADMIN_PASSWORD` in `.env` with a new random value (`openssl rand -hex 24`) and keep it nowhere else. The compose file still requires the variable, because Keycloak creates a bootstrap admin from it whenever its database is empty (a restore into a new volume, the re-import above); on an existing database it is not used, so the old password no longer opens anything.

Checked on 2026-10-20 with Keycloak 26.8.0 in a local container: the script turned the protection on (it was off with `failureFactor` 30), a second run changed nothing, steps 1 and 3 worked with kcadm, and after deleting `admin` the script printed the handover message and exited 0. Step 2 (TOTP in the browser) and the run on the test environment are still to do. If every admin is locked out, Keycloak can create a temporary admin with `kc.sh bootstrap-admin user` against the same database (Keycloak documentation "Recovering the admin account"; not tried here).

### Limits and when to leave this setup

- Funnel is a beta feature of Tailscale; it can change or be withdrawn. Bandwidth is limited and not configurable; this suits a test group, not production traffic.
- Funnel serves only ports 443, 8443 and 10000 and only names in your tailnet domain `<tailnet>.ts.net`; the names are public and appear in certificate transparency logs.
- TLS ends at tailscaled in your container. Tailscale's relays carry the encrypted stream and do not decrypt it.
- Certificates are requested per name and node; recreating state volumes repeatedly hits Let's Encrypt rate limits (up to 34 hours of lockout).
- Production should run on a VPS or a host with its own domain: `CADDY_SCHEME` empty (Caddy gets certificates), no `docker-compose.test.yml` (real `SMTP_*` instead of the mail catcher) and no Funnel overlay. The path blocks in `proxy.Caddyfile` apply there too.

## Deploying with GitHub Actions (TE-19)

Ticket TE-19 (#749). The workflow `.github/workflows/deploy.yml` ("Deploy") deploys a ref to the environment `test` or `prod`. It runs **only when started by hand** (Actions, "Deploy", "Run workflow"); nothing deploys as a side effect of a merge (E-14).

```text
Run workflow (environment, ref) -> guard on the runner -> joins the tailnet as a short-lived node tag:ci
  -> Tailscale SSH as user "deploy" to the host of that environment
  -> app/config/deploy/scripts/deploy.sh <full sha>   (backup, migrations, smoke test, automatic rollback)
```

### Rules per environment

| Environment | Allowed refs                                                       | Version                                                |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `test`      | any branch, tag or commit of this repository                       | snapshots allowed (`git describe` = `vX.Y.Z-N-g<sha>`) |
| `prod`      | only a commit on `main` that carries a stable release tag `vX.Y.Z` | non-snapshot only                                      |

- **Snapshot** means every state that is not exactly a release (ADR 0002: releases are the tags `vX.Y.Z` that semantic-release creates on `main`; `deploy.sh` shows the version as `git describe --tags --always`, so anything after a tag reads `vX.Y.Z-N-g<sha>`). **Non-snapshot** means: the resolved commit has a tag matching `^vX.Y.Z$` (digits only, no pre-release suffix) and is an ancestor of `origin/main`. The seed tag `v0.0.0` is not a release.
- The guard runs on the runner right after checkout (full history and tags), before the tailnet join and before any contact with the host. It resolves the ref to a full SHA, checks the rule above and the configuration, and fails with a clear message, for example `prod refused: <sha> is a snapshot, not a stable release tag (vX.Y.Z) on main.` or `Variable DEPLOY_HOST is not set in the GitHub environment prod`.
- `ref` defaults to the branch the workflow is run from. For `prod` run the workflow from `main` and enter the release tag (for example `v0.4.0`) as `ref`.
- Only people with write access can start workflows; forks cannot. The host receives the full SHA, never a branch name, and fetches `origin` with tags before it checks the commit out.
- One deploy per environment at a time (`concurrency: deploy-<environment>`, a running deploy is never cancelled).

### One-time setup (owner)

Nothing below goes into the repo: hostnames, tailnet name and secrets stay with the owner (the repo is public). Placeholders: `<host>` is the tailnet name of the host, `<repo-path>` the checkout on it.

1. **Test host:** install `tailscaled` as a system service in userspace mode (no TUN device, outbound only) and join with Tailscale SSH and the tag. This is a node of its own, next to the two Funnel containers; it gets its own tag so a public Funnel node is never a deploy target. Do it after step 3, or `tailscale up` refuses the tag:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   # Change only FLAGS: /etc/default/tailscaled also holds PORT, and without it tailscaled fails to start (--port=).
   sudo sed -i 's/^FLAGS=.*/FLAGS="--tun=userspace-networking"/' /etc/default/tailscaled
   sudo systemctl restart tailscaled
   sudo tailscale up --ssh --advertise-tags=tag:pflanzendex-deploy --hostname=<host-label>
   ```

   `tailscale up` prints a login link; approve it in the admin console. Create the Linux user `deploy`: member of the `docker` group, owner of the checkout and of `app/config/deploy/.env`, `git fetch` works from it. Give it **no** `sudo` (no group, no `/etc/sudoers.d` entry): whoever deploys gets a shell as `deploy`, and `deploy.sh` needs only Docker. Administer the host as another user or as root from the hypervisor.
2. **Prod host (does not exist yet):** the same with `--advertise-tags=tag:pflanzendex-prod`. Until it exists, leave `DEPLOY_HOST` unset in the environment `prod`; the workflow then fails at once with a clear message.
3. **Tailnet policy:** the tags, a network grant for port 22 only and one SSH rule per target; `tag:ci` gets nothing else. Merge into the existing policy (keep the Funnel tag and its `nodeAttrs`):

   ```json
   "tagOwners": {
     "tag:ci": ["autogroup:admin"],
     "tag:pflanzendex-deploy": ["autogroup:admin"],
     "tag:pflanzendex-prod": ["autogroup:admin"]
   },
   "grants": [
     { "src": ["tag:ci"], "dst": ["tag:pflanzendex-deploy", "tag:pflanzendex-prod"], "ip": ["tcp:22"] }
   ],
   "ssh": [
     { "action": "accept", "src": ["tag:ci"], "dst": ["tag:pflanzendex-deploy"], "users": ["deploy"] },
     { "action": "accept", "src": ["tag:ci"], "dst": ["tag:pflanzendex-prod"], "users": ["deploy"] }
   ],
   "sshTests": [
     { "src": "tag:ci", "dst": ["tag:pflanzendex-deploy"], "accept": ["deploy"], "deny": ["root"] }
   ]
   ```

   The first working setup (2026-10-29) used exactly this; whether Tailscale SSH works without the `tcp:22` grant was not tested. `accept` (not `check`) because a runner cannot answer a browser check. If a catch-all rule exists, make sure its `src` does not cover `tag:ci` (a rule with `src: ["autogroup:member"]` does not). Right after joining, `tailscale status` on the host may warn "access controls don't allow anyone to access this device" (seen on 2026-10-29 before the first run, gone after it; the cause was not pinned down). Run the check in step 7; if the "deploy" step then fails with an SSH error, the policy is missing one of the rules above.

4. **OAuth client** (Tailscale admin console, Settings, OAuth clients): scope "Auth Keys" with write access, tag `tag:ci` only. One client for both environments, or one per environment (then the prod client can be revoked on its own).
5. **GitHub environments** (repository Settings, Environments). Both use the same names, set per environment: **secrets** `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`; **variables** `DEPLOY_HOST` (`<host>`, a MagicDNS name) and `DEPLOY_REPO_PATH` (`<repo-path>`, default if unset: `/opt/pflanzendex`).
   - `test`: "Deployment branches and tags" set to **all branches** (no restriction), because the test environment may deploy from any branch. Its secrets are still out of reach for fork pull requests: nothing on `pull_request` uses the environment, forks cannot dispatch workflows, and environment secrets are never given to fork runs.
   - `prod`: "Deployment branches and tags" limited to the branch `main` and the tag pattern `v*`; optionally add required reviewers so every prod deploy waits for an approval.
6. **`.env` up to date:** compare the variable names of `app/config/deploy/.env.example` at the ref you deploy with the host's `.env` (names only, never print values); a missing required one stops `docker compose` and the deploy rolls back. Example: `DB_OWNER_PASSWORD` (#910), `openssl rand -hex 24`.
7. **Check:** run "Deploy" for `test` with `dev`, then try `prod` with a branch and with `main` (both must be refused by the guard before the tailnet join), and later with a release tag.

### First deploy of a host on an old version

`deploy.sh` is the script of the commit the host has checked out **before** the deploy; it checks out the target and then calls that commit's helper scripts (`smoke.sh`, `keycloak/master-realm.sh`). When the two versions disagree, the deploy fails although the target is fine. Seen on 2026-10-29 when the test host was still on `v0.1.0`: the old `deploy.sh` called the new `smoke.sh` without `SMOKE_DETAILS_CMD`, `smoke.sh` asked the proxy for `/health/details` (no longer public, #759), got 404 and rolled back. Bridge it once on the host, as `deploy`, in the checkout:

```bash
SMOKE_DETAILS_CMD="docker compose --env-file .env exec -T api wget -qO- http://127.0.0.1:3000/health/details" \
  app/config/deploy/scripts/deploy.sh <full sha>
```

(The command runs in `app/config/deploy`, hence `.env`.) After that the host runs the new script and the workflow works as is. The workflow shows only the last 60 lines, which are mostly the rollback; to see the first error, run `deploy.sh` once on the host with the output in a file and look at the lines before `ERROR: deploy of`.

### Deploy by hand

Actions, "Deploy", "Run workflow": choose the workflow's branch (`main` for prod), the environment and optionally a `ref`. This also rolls back: choose an earlier commit (test) or an earlier release tag (prod).

### Pause deploys

Disable the workflow (Actions, "Deploy", menu, "Disable workflow", or `gh workflow disable deploy.yml`), or remove `TS_OAUTH_SECRET` from the environment. Revoking the OAuth client in the Tailscale admin console cuts the path completely.

### Reading a failed run

Open the run. A red "target" step is a guard or configuration failure (nothing was contacted). In the step "deploy" the last 60 lines of the `deploy.sh` output are printed and repeated in the summary. `deploy.sh` rolls back to the previous ref by itself when the build, a migration, the health checks or the smoke test fail, so the environment keeps running the previous version; the run is still red. Lines to look for: `ERROR: deploy of ... failed; rolling back`, then `ROLLBACK ok` (previous version live again) or `ROLLBACK FAILED` (manual intervention on the host, see `release-and-rollback.md`). Migrations are not rolled back (restore the pre-deploy backup for data problems). An SSH or Tailscale error before any `deploy.sh` output means a setup problem (policy, tag, revoked OAuth client, wrong `DEPLOY_HOST`); the host was not touched.

### Security notes

- **Who can run code on a host:** whoever can edit the workflow on a branch the environment accepts, or holds the OAuth secret, can run commands as `deploy` (member of the `docker` group) on that host. Contained by the isolated network of the hosts (no inbound connections), the single SSH rule per target for `tag:ci`, the `prod` restriction to `main` and `v*` tags (changing `main` needs a pull request and a green `ci-status`; workflow files are gate files that the owner reviews), and optional required reviewers. The `test` environment accepts all branches, so a writer can deploy any branch there; that is the intended trade-off and why the test host holds no real data.
- **Untrusted input:** the workflow never puts event data into a shell script; inputs arrive through `env:`, are validated (ref, host name, path, full SHA) and quoted. The runner checks out the repository only to read history and tags and runs no repository code; only the host runs `deploy.sh`.
- **Blast radius of `tag:ci`:** it can open Tailscale SSH sessions as `deploy` on the tagged hosts and nothing else. The node is ephemeral and disappears after the run.
- **Host key:** Tailscale SSH authenticates the host by its tailnet node key. The workflow uses `StrictHostKeyChecking=accept-new` (the runner starts with an empty `known_hosts`; `yes` would fail on every run, `no` would also accept a changed key).

## DB roles in production

Issue #907. Why: a `security definer` function runs with the rights of the table owner. Row-level security does not bind a superuser or a role with `BYPASSRLS`, so with such an owner every function that trusted the row rule saw all accounts (audit: `docs/guides/reference/security-definer-audit.md`; the functions now name the account, this is the second line of defence). The postgres image's cluster user is a superuser, so the schema must not belong to it.

| Role                                          | Is                                                        | Used by                                                                                 |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POSTGRES_USER` (cluster user)                | superuser                                                 | administration only: `backup.sh`, `restore.sh`, the one-shots `db-roles`, `keycloak-db` |
| `DB_OWNER_USER` (default `pflanzendex_owner`) | login, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB | owns the schema; connection of `migrate` and `api` (background jobs run as it)          |
| `pflanzendex_app`                             | NOLOGIN, NOSUPERUSER, NOBYPASSRLS                         | the api switches to it per transaction (`set local role`), all row rules apply          |
| `keycloak` (`KEYCLOAK_DB_USER`)               | login, own database only                                  | the sign-in service                                                                     |

The migration role is the owner role. A separate runtime role is not possible yet: the background jobs and the checked functions need the owner's rights, and the policies that name the owner (`owner_count`, `owner_decides`, `lock_for_merge`, ...) are bound to whoever runs the migrations (migration 0094 keeps them on the current owner).

### Checklist

1. `.env` has `DB_OWNER_PASSWORD` (random hex, different from the other secrets; `DB_OWNER_USER` only if you want another name than `pflanzendex_owner`). `docker compose` stops with "DB_OWNER_PASSWORD is missing" otherwise.
2. `docker compose ... up -d` runs the one-shot `db-roles` (as the cluster user) before `migrate`: it creates `pflanzendex_app` and the owner role, makes the owner the database owner and, on an existing volume, moves every table, sequence, type and function of schema `public` from the cluster user to the owner (`app/config/deploy/docker/db-roles/`). Idempotent; the password follows `.env` on every run.
3. `migrate` and `api` connect as the owner and run with `DB_ROLE_CHECK=enforce`: they refuse to start when the connection role, the owner of the tables or `pflanzendex_app` is a superuser or has `BYPASSRLS`. The existing deployment is converted in place by the next `make deploy`; migration 0094 then re-targets the owner policies. Take `make backup` first (the deploy does).
4. Check afterwards:

   ```bash
   c="docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml"
   $c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atf -' <<'SQL'
   select r.rolname, r.rolsuper, r.rolbypassrls from pg_class c join pg_roles r on r.oid = c.relowner where c.relname = 'account';
   select count(*) from pg_proc p join pg_roles r on r.oid = p.proowner where p.pronamespace = 'public'::regnamespace and (r.rolsuper or r.rolbypassrls);
   SQL
   ```

   Expected: `pflanzendex_owner|f|f` and `0`. `$c logs api | grep "DB role check"` prints nothing.

5. Restore: `restore.sh` restores the app dump as `DB_OWNER_USER` (`pg_restore --role`), so a restore keeps the ownership; the role must exist (run `up` once on a fresh host before restoring). `make restore-test` proves it. Never restore the app dump with another tool as the cluster user: the objects would belong to the superuser again and the api would refuse to start.
6. Local development (`make dev`, `make db-up`) still uses the image's superuser; `DB_ROLE_CHECK` defaults to `warn` there and logs the finding. The test suite runs as a plain owner (QG-D1) and in a superuser-owner scratch database for the functions that matter.
7. Rolling back to a release before this change works without touching the database: the old compose file connects as the cluster user (a superuser can use everything the owner owns), the policies already follow the owner. Do not move the ownership back; fix forward.

## Health check (US-DEV-09)

`GET /health` (no sign-in, public) answers only the status, for example `{"status":"ok"}` (HTTP 503 with `{"status":"error"}`). Version, commit and queue counts would help an attacker match the deployment to known issues (#759), so they are on `GET /health/details`, which the proxy answers with 404 on the public name (also as `/api/health/details`). Read it inside the stack: `docker compose --env-file .env exec -T api wget -qO- http://127.0.0.1:3000/health/details`. It answers with version, commit and `checks`:

| Field             | Values                                                                          | Meaning                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `status`          | `ok`, `degraded`, `error`                                                       | `error` (HTTP 503) when the database does not answer within 2 s (assumption); `degraded` (HTTP 200) for the job queue |
| `checks.database` | `ok`, `error`, `not_configured`                                                 | `select 1` against the API's pool; the error text is never passed on                                                  |
| `checks.jobs`     | `{ status: ok \| dead_jobs, queued, running, dead }`, `error`, `not_configured` | counts of the job queue (TE-06); `dead_jobs` = at least one job gave up with its error kept                           |
| `checks.storage`  | `configured`, `not_configured`                                                  | whether the photo storage (S3) is set up; it is not called on every check                                             |

The Compose health check of `api` uses `/health`: a 503 marks the container unhealthy and fails the deploy, which then rolls back. The smoke test of `make deploy` reads the version from `/health/details` inside the api container. Monitoring needs only the public status: alert on `status != "ok"` and on HTTP 503.

## Runbooks for incidents (US-DEV-09)

Each runbook: what you see, what to check, what to do. Restoring a backup and the fallback to the previous version are above ("Restore") and in `release-and-rollback.md`.

### Migration fails

- **You see:** `make deploy` ends with an error at the `migrate` service; `deploy.sh` has rolled back to the previous ref, the old version keeps running.
- **Check:** `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml logs migrate` names the file and the SQL error. Migrations are forward only and run under an advisory lock, so a half-applied file is rolled back by its transaction.
- **Do:** fix the migration in a new PR (never edit an applied file: the checksum check refuses it), deploy again. If data was changed by hand meanwhile, take `make backup` first. Restore from the backup taken by the deploy only if the data itself is wrong.

### Database not reachable

- **You see:** `/health` answers 503 with `status: "error"`, `/health/details` shows `checks.database: "error"`; the API container is unhealthy.
- **Check:** `docker compose … ps db`, `docker compose … logs db` (disk full, crash loop, wrong password in `.env`).
- **Do:** free disk space or fix `.env`, `docker compose … up -d db`, wait for `/health` to answer 200. If the data volume is damaged: restore the latest backup (above).

### Dead jobs

- **You see:** `/health` answers `degraded`, `/health/details` shows `checks.jobs.status: "dead_jobs"`.
- **Check:** on the database, `select type, last_error, finished_at from job where status = 'dead' order by finished_at desc limit 20;` (owner role). Handlers are repeatable (US-QS-03).
- **Do:** fix the cause (external source down, bug), then order the job again through the feature that creates it (the queue merges duplicates). Old finished jobs are purged by the worker.

### Photo storage full or unavailable

- **You see:** photo uploads fail with `media.storage_unavailable` (HTTP 502); measurements are still saved without photo. `/health/details` shows `checks.storage: "configured"`, because the storage is not called on every check.
- **Check:** the S3 provider's console (quota, credentials, bucket); the `S3_*` variables of the API (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT`).
- **Do:** raise the quota or fix the credentials, restart `api`. Nothing has to be repaired in the database: a failed upload stores nothing (P-10).

### Security incident

- **You see:** a leaked secret (GitHub secret scanning, QG-S1), unusual sign-ins, or a report through `SECURITY.md`.
- **Do, in this order:** rotate the affected secret (database password in `.env` on the host, S3 keys) and restart the stack; if tokens may be affected, end all sessions at the sign-in service; take `make backup` and keep the logs; follow `SECURITY.md` for disclosure. Personal data affected: the operator has to decide about the notification duty (GDPR Art. 33, 72 hours).

**Open:** runbooks for the AI interface, reminders and the GDPR deletion follow with their features (KI, MON, US-ACC-04); operator messages for errors and dead jobs (NFR-18) and operating metrics (NFR-16) do not exist yet.

## Open (needs hardware, a domain or a decision)

None of this is done or made up:

- **Host:** the hardware for staging/production is not named yet; scripts and Compose were only checked locally.
- **Domain and DNS:** the test environment needs two hostnames at the upstream proxy; there is no public address yet for staging/production. Needed: a domain, an A/AAAA record (dynamic DNS if the IP changes) or a tunnel, ports 80/443 forwarded to the host. Without these Caddy cannot get a public certificate. Reachability from outside over HTTPS (criterion from #40) is therefore **not** proven (R-11, spike TE-15).
- **Security updates:** set up automatic updates on the host (e.g. `unattended-upgrades`, reboot policy) and document them here.
- **Backup to a second location:** decide the target for `BACKUP_REMOTE` (second machine, external storage) and how the copy is encrypted. Photos/object storage are not backed up yet because they do not exist yet (TE-05).
- **Monitoring and alerts:** `/health` now reports database and job queue (see "Health check"); an external monitor that polls it and alerts, and a check of the backup age, are not set up yet (DEV-09, #172).
- **Image pins:** base images are pinned to major versions, not digests; Renovate (FR-QG-15) pins digests once it is active.
- **Migrations:** applied by the deploy itself (see above, #201). `deploy.sh` backs up before every deploy while the DB is running (DEV-07, #170); on the very first deploy there is no database to back up.
- **Sign-in service:** now in the stack (see "Test environment behind a reverse proxy"). The admin, master realm and management paths are blocked in `proxy.Caddyfile`. Still open for production: a real SMTP server (`SMTP_*`), a realm review for production (the file is shared with the test environment), Keycloak's own security updates, and the invitation phase on a public deployment (`invitation-phase.md`, #301).
- **Test environment on the real host:** not yet run on the target LXC container behind the real upstream proxy; the figures above come from a development machine. The browser sign-in flow (redirect, PKCE, token refresh) was not repeated by hand here; the pieces (redirect address, issuer, key fetch, mail link) were each checked.
- **Confirmation:** `restore.sh` over the production database now expects `CONFIRM=yes` (was `CONFIRM=ja` before the tooling was translated).
