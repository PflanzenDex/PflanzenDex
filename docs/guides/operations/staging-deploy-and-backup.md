# Runbook: deploy staging, back up, restore

Ticket TE-03 (#40). Basis: E-01 (self-hosting, Docker Compose, one host), R-09, R-11, NFR-15, QG-S1. All files live in `app/config/deploy/` (`docker/` holds the Dockerfiles and the web server config, `keycloak/` the realm and the database init).

## Overview

| Service       | Job                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy`       | Caddy: two hostnames (app, sign-in); plain HTTP behind a TLS-terminating proxy or HTTPS with automatic certificates; `/health` and `/api/*` (prefix removed) go to the API, the rest of the app host to web, the sign-in host to Keycloak |
| `api`         | Hono API (Node 24, through tsx, because `core` is exported as TypeScript source)                                                                                                                                                          |
| `web`         | static PWA (Vite build, Caddy)                                                                                                                                                                                                            |
| `db`          | PostgreSQL 16, data in the `dbdata` volume                                                                                                                                                                                                |
| `migrate`     | one-shot, same image as `api`: applies pending SQL migrations, then exits (#201)                                                                                                                                                          |
| `keycloak`    | sign-in service (Keycloak 26.8, production mode), data in its own database in `db`; imports the realm `pflanzendex` on its first start                                                                                                    |
| `keycloak-db` | one-shot: creates the sign-in role and database in `db`, idempotently (also on an existing volume)                                                                                                                                        |
| `mailpit`     | test environment only (`docker-compose.test.yml`): catches the confirmation emails                                                                                                                                                        |

The database and Keycloak are not exposed. Only the proxy listens (ports from `HTTP_PORT`/`HTTPS_PORT`). Every service has a memory limit (starting values for a 3 GB host, assumptions; see "Memory" below).

**Compression and caching (NFR-12):** the proxy compresses text responses (HTML, JS, CSS, JSON, SVG) with zstd or gzip, whichever `Accept-Encoding` asks for; Brotli would need a Caddy plugin and is not used. `web` sends `Cache-Control: public, max-age=31536000, immutable` for the hashed files under `/assets/` and `no-cache` (revalidate) for `index.html`, the service worker, the web manifest and SPA routes. The config is `app/config/deploy/proxy.Caddyfile` and `app/config/deploy/docker/web.Caddyfile`; the test is `serving-headers.test.ts` in `app/packages/web/src/lib/test-setup/`.

## One-time setup (host)

1. Install Docker and Docker Compose, clone the repo.
2. `cp app/config/deploy/.env.example app/config/deploy/.env` and fill in the values (long random passwords, `APP_URL`/`AUTH_URL` and `APP_HOST`/`AUTH_HOST` = the two public addresses, `KEYCLOAK_*`, `SMTP_*`; the template explains each). The file is in `.gitignore`; secrets never go into the repo (QG-S1).
3. Schedule backups with cron or a timer, e.g. daily: `0 3 * * * cd /path/to/repo && make backup`.

## Deploy from `main`

```bash
make deploy          # fetches origin/main, backs up the DB (if it runs), builds, starts, waits for /health
```

To try another state: `app/config/deploy/scripts/deploy.sh origin/dev`. Builds are reproducible: `npm ci` from the lock file, base images pinned to major versions (`node:24-alpine`, `postgres:16-alpine`, `caddy:2-alpine`). `GET /health` shows the running version (`version` = commit hash).
Migrations run on every deploy: the one-shot `migrate` service (same image as `api`, `packages/db/migrations`) applies pending files before the `api` starts (`depends_on: service_completed_successfully`). They are forward only and guarded by an advisory lock and checksums. A failing migration fails `compose up`, so `deploy.sh` rolls back to the previous ref and the API never runs against a half-migrated schema. Check with `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml logs migrate`. Migrations are not rolled back; use the pre-deploy backup (restore below) for data problems. Manual run: `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml run --rm migrate`.
Rollback: `app/config/deploy/scripts/deploy.sh <earlier commit>`; for data problems, restore (below).

Trying it locally (without a domain): `.env` with `CADDY_SCHEME=` (empty), `APP_HOST=localhost`, `AUTH_HOST=auth.localhost`, `APP_URL=https://localhost:8443`, `AUTH_URL=https://auth.localhost:8443`, then `docker compose --env-file app/config/deploy/.env -f app/config/deploy/docker-compose.yml up -d --build` and `curl -k https://localhost:8443/health`.

## Backup

```bash
make backup          # app/config/deploy/backups/pflanzendex-<UTC time>.dump and keycloak-<UTC time>.dump (pg_dump -Fc)
```

Each run writes two files when the sign-in service exists: `pflanzendex-*.dump` (app data) and `keycloak-*.dump` (identities, sessions, realm settings; without it nobody could sign in after a restore). The script verifies the file with `pg_restore -l`, deletes backups older than `BACKUP_RETENTION_DAYS` and copies them to `BACKUP_REMOTE` with `rsync` if set (second location, R-11). An unreadable backup fails with an error (a backup that cannot be restored is an incident, NFR-15).

## Restore

```bash
# into a second database (safe, for checking):
app/config/deploy/scripts/restore.sh app/config/deploy/backups/<file>.dump pdx_check
# over the production database (overwrites it; stop the API first; a keycloak-*.dump goes into the sign-in database,
# stop `keycloak` first instead):
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
- **Keycloak** (`quay.io/keycloak/keycloak:26.8.0`, same as `make auth-up`) runs in production mode (`start`) with HTTP enabled inside the network. Its data lives in its own database `keycloak` with its own role in the existing `db` service (a second PostgreSQL would cost 100+ MB of the scarce memory). The one-shot `keycloak-db` creates role and database idempotently on every `up`, also on an existing volume, and revokes `CONNECT` on the app database from everyone but the cluster user: the sign-in role cannot reach tenant data (P-04). Port 8080 is published only on the host's loopback (`127.0.0.1:${KEYCLOAK_ADMIN_PORT}`, default 8180) for the admin console over an SSH tunnel (see "Admin console over an SSH tunnel"); the management port 9000 is not published.
- **Realm** `pflanzendex` is imported on the first start from `app/config/deploy/keycloak/pflanzendex-realm.json`. It matches the development realm (clients `pflanzendex-api` and `pflanzendex-web` with S256 PKCE, audience mapper, `fullScopeAllowed: false`, access token 5 minutes (ADR 0009), password policy `length(10)`, login theme `pflanzendex`, email verification, self-registration) and differs in three ways: no test users, redirect addresses and web origin come from `APP_URL` (placeholder `${WEB_BASE_URL}`), SMTP comes from `SMTP_*` (placeholders `${KC_SMTP_*}`). Checked on 2026-10-11 with Keycloak 26.8.0: string placeholders (also inside arrays and empty values) are resolved; for booleans they are not reliable (see `invitation-phase.md`), which is why `registrationAllowed` stays a command, not a placeholder. **A changed realm file does not touch an existing realm** (`IGNORE_EXISTING`): change a live realm in the admin console or with `kcadm.sh`; to re-import, drop the `keycloak` database (`docker compose ... stop keycloak`, then drop and re-run `up`) and lose its accounts.
- **API settings.** `OIDC_ISSUER` is the public issuer (`${AUTH_URL}/realms/pflanzendex`), because tokens carry it in `iss`. The API does not fetch keys through that public address (that would need the host to reach its own proxy and TLS): `OIDC_JWKS_URL=http://keycloak:8080/realms/pflanzendex/protocol/openid-connect/certs` points the key fetch inside the network, while signature, issuer and audience (`OIDC_AUDIENCE=pflanzendex-api`) are still checked as before (test `token.test.ts`, TE-03). `WEB_ORIGIN=${APP_URL}` sets CORS; `AI_RESOURCE_URL=${APP_URL}/api/mcp`.
- **Web build.** `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` and `VITE_API_URL=${APP_URL}/api` are build arguments of `web.Dockerfile` (Vite compiles them into the bundle), so changing `APP_URL` or `AUTH_URL` needs a rebuild (`make deploy` does it). The API is reached under `/api` on the same origin, so there is no cross-origin call; the proxy removes the `/api` prefix.
- **Mail.** The realm requires email confirmation. `docker-compose.test.yml` adds Mailpit (no ports published) and a Caddy route to its UI at `https://auth.example.test/mail/` behind basic auth (`MAIL_UI_USER`, `MAIL_UI_HASH`, see "Public test environment through Tailscale Funnel"); the realm sends to it by default. It shows every email, so it must exist only in the test environment. Production sets `SMTP_*` in `.env` and does not load the overlay.

### One-time setup

1. Install Docker and the Compose plugin, clone the repo, check out `dev`.
2. Configure the upstream proxy: both hostnames to `http://<host>:80`, WebSocket not needed, forward `Host`, `X-Forwarded-Proto: https`, `X-Forwarded-For`. Note the proxy's address as seen from the host.
3. `cp app/config/deploy/.env.example app/config/deploy/.env` and set at least:

   | Variable                                                               | Value                                                                                                          |
   | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
   | `POSTGRES_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD` | three different random values, e.g. `openssl rand -hex 24` (hex only: the scripts source the file)             |
   | `APP_URL`, `AUTH_URL`                                                  | `https://app.example.test`, `https://auth.example.test` (what the browser shows, no trailing slash)            |
   | `APP_HOST`, `AUTH_HOST`                                                | `app.example.test`, `auth.example.test`                                                                        |
   | `CADDY_SCHEME`                                                         | `http://`                                                                                                      |
   | `TRUSTED_PROXIES`                                                      | the upstream proxy's address(es) as CIDR, space separated, e.g. `192.0.2.10/32`                                |
   | `COMPOSE_FILE`                                                         | `docker-compose.yml:docker-compose.test.yml` (adds Mailpit; `deploy.sh`, `backup.sh` and `restore.sh` read it) |

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

Note: `deploy.sh` checks out the ref in the checkout (detached HEAD). Production stays a deliberate step (E-14); the test environment is deployed by `deploy-test.yml` (see "Automatic deploy of the test environment (TE-19)").

### First account and the operator role

1. Open `https://app.example.test`, press the sign-in button and choose register (self-registration is on in the test environment). Keycloak asks for email confirmation.
2. Open `https://auth.example.test/mail/` (the mail catcher), open the email and follow the link; set the password (at least 10 characters). Sign in; the first sign-in creates the account.
3. Make the account the operator: follow `invitation-phase.md` steps 4 to 5. The subject is the Keycloak user id (`kcadm.sh get users -r pflanzendex -q email=<email> --fields id`; the admin console `/admin/` is blocked on the public name; open it over an SSH tunnel, see "Admin console over an SSH tunnel"). `compose` there stands for `docker compose --env-file app/config/deploy/.env`; the compose files come from `COMPOSE_FILE`, so no `-f` is needed. The tab "Betreiber" appears after a reload.

### Closing self-registration

Registration is a per-installation switch, not part of the build (`invitation-phase.md`). When the test environment should accept only invited people: realm switch `docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin` (asks for the password), then `... kcadm.sh update realms/pflanzendex -s registrationAllowed=false`; and the app switch "nur mit Einladungscode" in the operator area. Both layers and the consequence (the operator creates the identities) are described in `invitation-phase.md`. To reopen: `-s registrationAllowed=true`.

### Deploy and update

`app/config/deploy/scripts/deploy.sh origin/dev` (backup first, migrations through the one-shot `migrate`, rollback to the previous ref if the api or Keycloak does not become healthy or the smoke test fails). With `CADDY_SCHEME=http://` the smoke test calls `http://127.0.0.1:$HTTP_PORT` with the `Host` header of `APP_HOST`; set `SMOKE_URL` to test through the public address instead. A Keycloak image update is a change of the tag in `docker-compose.yml` (keep it equal to `app/config/dev/compose.yaml`).

### Backup and restore

`make backup` writes `pflanzendex-*.dump` and `keycloak-*.dump` (see "Backup"). Restore the sign-in database into a check database: `app/config/deploy/scripts/restore.sh app/config/deploy/backups/keycloak-<time>.dump kc_check`; over the live one: stop `keycloak`, `CONFIRM=yes app/config/deploy/scripts/restore.sh app/config/deploy/backups/keycloak-<time>.dump`, start `keycloak`. The restored objects keep their owner (the `keycloak` role). Restore app and sign-in dump from the same run so account subjects and identities match. `make restore-test` covers both databases.

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

4. Settings, Keys, **Generate auth key**: reusable, pre-approved, **not ephemeral**, tag `tag:pflanzendex-funnel`, expiry as you like (the key is needed only to register the nodes; later restarts use the state volumes). Copy it into `.env` as `TS_AUTHKEY` and treat it as a secret.
5. After the first start check in the admin console (Machines) that both nodes carry the tag and that their key expiry is disabled (tagged nodes have none by default); otherwise they drop out after the key lifetime.

### `.env` for Funnel

Start from `.env.example`; in addition to the variables of "Test environment behind a reverse proxy" set:

| Variable                       | Value                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`, `AUTH_URL`          | `https://app.example-tailnet.ts.net`, `https://auth.example-tailnet.ts.net`                                             |
| `APP_HOST`, `AUTH_HOST`        | the same names without scheme                                                                                           |
| `CADDY_SCHEME`                 | `http://`                                                                                                               |
| `TRUSTED_PROXIES`              | `172.29.40.2/32 172.29.40.3/32`                                                                                         |
| `TS_AUTHKEY`                   | the auth key from step 4                                                                                                |
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
3. Log in as `KEYCLOAK_ADMIN_USER` (default `admin`) with `KEYCLOAK_ADMIN_PASSWORD` from `app/config/deploy/.env` on the host. Read it there without copying the file anywhere: `ssh <host> "grep '^KEYCLOAK_ADMIN_PASSWORD=' <repo>/app/config/deploy/.env | cut -d= -f2"`. Change it in the console afterwards if you like (the `.env` value is used only for the first start of an empty database).
4. Close the tunnel with Ctrl+C when done.

If port 8180 is taken on the host or the workstation, set `KEYCLOAK_ADMIN_PORT` in `.env`, redeploy, and use the same number on both sides of `-L`. The local port in the browser must equal `KEYCLOAK_ADMIN_PORT`, because Keycloak builds the console's links from it.

### Operator work without the admin console

Everything the console does also works on the command line inside the container, without a tunnel: `docker compose --env-file app/config/deploy/.env exec keycloak /opt/keycloak/bin/kcadm.sh ...` (log in first with `kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin`, as in "Closing self-registration"). The operator role steps of `invitation-phase.md` use `kcadm.sh get users` and need no console.

### Limits and when to leave this setup

- Funnel is a beta feature of Tailscale; it can change or be withdrawn. Bandwidth is limited and not configurable; this suits a test group, not production traffic.
- Funnel serves only ports 443, 8443 and 10000 and only names in your tailnet domain `<tailnet>.ts.net`; the names are public and appear in certificate transparency logs.
- TLS ends at tailscaled in your container. Tailscale's relays carry the encrypted stream and do not decrypt it.
- Certificates are requested per name and node; recreating state volumes repeatedly hits Let's Encrypt rate limits (up to 34 hours of lockout).
- Production should run on a VPS or a host with its own domain: `CADDY_SCHEME` empty (Caddy gets certificates), no `docker-compose.test.yml` (real `SMTP_*` instead of the mail catcher) and no Funnel overlay. The path blocks in `proxy.Caddyfile` apply there too.

## Automatic deploy of the test environment (TE-19)

Ticket TE-19 (#749). Production stays a deliberate step (E-14, release tag); the test environment deploys itself from `dev` after green CI. The workflow is `.github/workflows/deploy-test.yml`.

```text
merge into dev -> CI (push run on dev) green -> deploy-test.yml (GitHub-hosted runner)
  -> joins the tailnet as a short-lived node tag:ci (Tailscale OAuth client, secrets of the environment "test")
  -> Tailscale SSH as user "deploy" to the test host (tag:pflanzendex-deploy)
  -> app/config/deploy/scripts/deploy.sh <sha>   (backup, migrations, smoke test, automatic rollback)
```

### What happens on a merge

1. The squash merge creates a push to `dev`; the workflow `CI` runs for it (the PR run already checked the change, this run checks the merged result).
2. When that run succeeds, `deploy-test.yml` starts (`workflow_run`). It ignores runs that failed, that are not push runs, that belong to another branch or that come from a fork.
3. The job waits for the environment `test` (deployment branches limited to `dev`), joins the tailnet with the Tailscale action (pinned to a commit SHA) and runs `deploy.sh <full SHA of the tested commit>` on the host over SSH. Only one deploy runs at a time (`concurrency: deploy-test`, a running deploy is never cancelled).
4. The log tail and the line `Deploy ok: <version> (<sha>, <ref>)` are in the job summary. The deployment shows up under "Deployments" of the repository and in the environment `test`.

### One-time setup (owner)

Nothing below goes into the repo: hostnames, tailnet name and secrets stay with the owner (the repo is public). Placeholders: `<host>` is the tailnet name of the test host, `<repo-path>` is the checkout on the host.

1. **Host:** install `tailscaled` as a system service in userspace mode (no TUN device, outbound only) and join with Tailscale SSH and the tag, using an auth key or OAuth client that may create nodes with this tag: `tailscale up --ssh --advertise-tags=tag:pflanzendex-deploy`. Create the Linux user `deploy` (member of the `docker` group, owner of the checkout, `git fetch` works from it). Give the host a stable machine name; this is `<host>`.
2. **Tailnet policy:** add the tags and exactly one SSH rule for `tag:ci`:

   ```json
   "tagOwners": {
     "tag:ci": ["autogroup:admin"],
     "tag:pflanzendex-deploy": ["autogroup:admin"]
   },
   "ssh": [
     { "action": "accept", "src": ["tag:ci"], "dst": ["tag:pflanzendex-deploy"], "users": ["deploy"] }
   ]
   ```

   Add no `acls` entry for `tag:ci` (the SSH rule is enough for Tailscale SSH, nothing else in the tailnet becomes reachable). If the policy has a catch-all `acls` rule such as `*:*`, tighten it so that `tag:ci` is not covered.

3. **OAuth client** (Tailscale admin console, Settings, OAuth clients): scope "Auth Keys" with write access, tag `tag:ci` only. Copy the client id and secret once.
4. **GitHub environment `test`** (repository Settings, Environments): "Deployment branches and tags" limited to the selected branch `dev`; no other branch can use the environment. Add the **environment secrets** (not repository secrets, so a pull request from a fork never sees them) `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`, and the **environment variables** `TEST_HOST` (`<host>`, a MagicDNS name) and `TEST_REPO_PATH` (`<repo-path>`; default if unset: `/opt/pflanzendex`). Required reviewers are optional; with them the deploy waits for an approval.
5. **CI on `dev`:** `ci.yml` must run for pushes to `dev` (`on.push.branches: [main, dev]`); without that run there is nothing for `deploy-test.yml` to wait for.
6. **Check:** run the workflow by hand (below) and watch the job summary; then merge a small change into `dev` and confirm that the deployment appears without a manual step. Check the isolation once: `tailscale ssh` as `tag:ci` to any other node is refused, and a push to another branch cannot start the job (the environment rejects it).

### Deploy by hand

Actions, "Deploy test environment", "Run workflow": pick `dev` as the workflow's branch (the environment accepts no other) and optionally a `ref` (branch, tag or commit; default `dev`). The ref must be part of `dev`, so this also rolls back to an earlier commit of `dev`. The workflow resolves it to a full SHA first.

### Pause auto-deploy

- Disable the workflow: Actions, "Deploy test environment", menu, "Disable workflow" (or `gh workflow disable deploy-test.yml`). Enable it again the same way.
- Or hard stop: remove the secret `TS_OAUTH_SECRET` from the environment, or add required reviewers to it. Revoking the OAuth client in the Tailscale admin console cuts the path completely.

### Reading a failed run

Open the run, step "deploy": the last 60 lines of the `deploy.sh` output are printed and repeated in the summary. `deploy.sh` rolls back to the previous ref by itself when the build, a migration, the health checks or the smoke test fail, so the test environment keeps running the previous version; the step still exits non-zero and the run is red. Lines to look for: `ERROR: deploy of ... failed; rolling back`, then `ROLLBACK ok` (previous version is live again) or `ROLLBACK FAILED` (manual intervention on the host, see `release-and-rollback.md`). Migrations are not rolled back (restore the pre-deploy backup for data problems). An SSH or Tailscale error before any `deploy.sh` output means a setup problem (policy, tag, expired or revoked OAuth client, wrong `TEST_HOST`); the host was not touched. The queue keeps only the newest waiting run, so after a burst of merges the latest commit wins.

### Security notes

- **Who can run code on the host:** whoever controls the workflow file or the OAuth secret can run commands as `deploy` (member of the `docker` group) on the test host. Contained by the isolated network of the host (no inbound connections), the environment restriction to `dev` (merging into `dev` needs a pull request and green `ci-status`; workflow files are gate files that the owner reviews), and the single SSH rule for `tag:ci`.
- **Forks and other branches:** environment secrets and variables are released only to jobs on `dev`. Fork pull requests do not get secrets at all; `workflow_run` is ignored for runs whose head repository is not this repository; the job also checks that the branch is `dev`.
- **Untrusted input:** the job never puts event data into a shell script; everything arrives through `env:`, is validated (full SHA, host name, path) and quoted. The job does not check out or run repository code on the runner; only the host runs `deploy.sh`.
- **Blast radius of `tag:ci`:** it can open Tailscale SSH sessions as `deploy` on `tag:pflanzendex-deploy` and nothing else. The node is ephemeral and disappears after the run.
- **Host key:** Tailscale SSH authenticates the host by its tailnet node key, so the SSH host key adds nothing on top. The workflow uses `StrictHostKeyChecking=accept-new` (the runner starts with an empty `known_hosts`; `yes` would fail on every run, `no` would also accept a changed key).

## Health check (US-DEV-09)

`GET /health` (no sign-in) answers with version, commit and `checks`:

| Field             | Values                                                                          | Meaning                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `status`          | `ok`, `degraded`, `error`                                                       | `error` (HTTP 503) when the database does not answer within 2 s (assumption); `degraded` (HTTP 200) for the job queue |
| `checks.database` | `ok`, `error`, `not_configured`                                                 | `select 1` against the API's pool; the error text is never passed on                                                  |
| `checks.jobs`     | `{ status: ok \| dead_jobs, queued, running, dead }`, `error`, `not_configured` | counts of the job queue (TE-06); `dead_jobs` = at least one job gave up with its error kept                           |
| `checks.storage`  | `configured`, `not_configured`                                                  | whether the photo storage (S3) is set up; it is not called on every check                                             |

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
- **Domain and DNS:** the test environment needs two hostnames at the upstream proxy; there is no public address yet for staging/production. Needed: a domain, an A/AAAA record (dynamic DNS if the IP changes) or a tunnel, ports 80/443 forwarded to the host. Without these Caddy cannot get a public certificate. Reachability from outside over HTTPS (criterion from #40) is therefore **not** proven (R-11, spike TE-15).
- **Security updates:** set up automatic updates on the host (e.g. `unattended-upgrades`, reboot policy) and document them here.
- **Backup to a second location:** decide the target for `BACKUP_REMOTE` (second machine, external storage) and how the copy is encrypted. Photos/object storage are not backed up yet because they do not exist yet (TE-05).
- **Monitoring and alerts:** `/health` now reports database and job queue (see "Health check"); an external monitor that polls it and alerts, and a check of the backup age, are not set up yet (DEV-09, #172).
- **Image pins:** base images are pinned to major versions, not digests; Renovate (FR-QG-15) pins digests once it is active.
- **Migrations:** applied by the deploy itself (see above, #201). `deploy.sh` backs up before every deploy while the DB is running (DEV-07, #170); on the very first deploy there is no database to back up.
- **Sign-in service:** now in the stack (see "Test environment behind a reverse proxy"). The admin, master realm and management paths are blocked in `proxy.Caddyfile`. Still open for production: a real SMTP server (`SMTP_*`), a realm review for production (the file is shared with the test environment), Keycloak's own security updates, and the invitation phase on a public deployment (`invitation-phase.md`, #301).
- **Test environment on the real host:** not yet run on the target LXC container behind the real upstream proxy; the figures above come from a development machine. The browser sign-in flow (redirect, PKCE, token refresh) was not repeated by hand here; the pieces (redirect address, issuer, key fetch, mail link) were each checked.
- **Confirmation:** `restore.sh` over the production database now expects `CONFIRM=yes` (was `CONFIRM=ja` before the tooling was translated).
