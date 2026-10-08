# Release, deploy and rollback

Covers US-DEV-06 (release process), E-13 (branch model) and E-14 (deploy is a deliberate step). Host setup, backups and restore: `staging-deploy-and-backup.md`.

## Release chain

1. A release is the pull request `dev` -> `main` with the full suite.
2. On `main`, after a green CI, semantic-release derives the next SemVer from the Conventional Commits and creates the tag `vX.Y.Z` and the GitHub release. It does not commit back (PR #195), so there is no version commit to merge back.
3. Nothing deploys automatically. The release only produces the tag.

## Where the version comes from

There is one source: the git tag. No version is written into versioned files.

- `deploy.sh` computes `APP_VERSION="$(git describe --tags --always)"`, for example `v0.1.0` (exactly on the tag) or `v0.1.0-3-gabc1234` (3 commits after it), and `GIT_SHA` (short commit).
- `docker-compose.yml` passes both as build args. The api image sets them as env vars, the web image as `VITE_APP_VERSION` at build time.
- `GET /health` returns `{"status":"ok","product":"PflanzenDex","version":"<describe>","commit":"<sha>"}`. Both show `unknown` if the build did not get a value (P-08).
- The web app shows `Version <describe>` in the footer.
- Local dev (`make dev`) has no build arg, so both show `unknown`.

## Deploy

On the host, in the checkout: `make deploy` (or `app/config/deploy/scripts/deploy.sh [ref]`, default `origin/main`; pass a tag such as `v0.1.0` to deploy a specific release).

Steps: fetch (with tags), remember the current commit as the rollback target, back up the database if it is running, check out the ref, build and start, wait for the api healthcheck, run the smoke test.

## Smoke test

`app/config/deploy/scripts/smoke.sh <base-url> <expected-version>` passes only if

- `GET <base-url>/health` answers 200 and its `version` equals the version just deployed, and
- `GET <base-url>/` (web root, through the proxy) answers 200.

It retries (`SMOKE_RETRIES`, default 15, every `SMOKE_DELAY`, default 2 s) because the proxy needs a moment. `deploy.sh` derives the base URL from `SITE_ADDRESS`/`HTTPS_PORT` in `deploy/.env`; override with `SMOKE_URL`. For `localhost` it uses `curl -k` (internal Caddy CA).

Not covered yet: the core flow named in US-DEV-06 (sign in, Heute list). That needs a smoke user and the Heute view and is still open.

## Automatic rollback

If the api does not become healthy or the smoke test fails, `deploy.sh` redeploys the previous commit (build, start, health, smoke test again) and exits non-zero with a clear message:

- `ROLLBACK ok ...`: the previous version is live again, the new one is not. Exit code is still 1, so the failed deploy is not mistaken for a success.
- `ROLLBACK FEHLGESCHLAGEN`: intervene manually (below).

Limits: database migrations are not reverted. Migrations must be expand/contract so the previous version still works (US-DEV-07). If data was damaged, restore the pre-deploy backup with `scripts/restore.sh`.

## Manual rollback

On the host, in the checkout: `make deploy` does not take a ref, so call the script: `app/config/deploy/scripts/deploy.sh v0.1.0` (the last good tag). The script runs the same backup, build and smoke test. Check afterwards with `curl -s https://<host>/health`.

## Hotfix path (E-13)

1. Branch from `main` (`fix/...`), keep the change small.
2. Pull request to `main` with the full suite; no bypassing of gates. semantic-release tags the patch release.
3. Deploy the new tag deliberately.
4. Merge `main` back into `dev` through a pull request so the branches do not drift.

## Open

- FR-DEV-05: check that the latest `v*` tag on `main` was created by semantic-release (no manual tags). Not implemented, no simple CI check exists; options are a tag ruleset on GitHub (only the release workflow may create `v*` tags) or a scheduled check.
- Smoke test of a core flow (sign in, Heute list).
- The smoke test does not yet check that the web footer shows the same version (the root is only checked for 200).
