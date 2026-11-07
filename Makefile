# One entry point for every task (US-DEV-01). Local runs and CI use the same targets (FR-QG-01).
# The Makefile holds no domain logic, only calls; an error stops the run and is never hidden (D-05).
APP := app
# Make exports command-line variables to every recipe and to every $(shell) call, and expands their values there, so a value
# with $(...) or a backtick would run as a command (issue 1608, measured with GNU make 4.4.1; issue 1636). Every caller value
# is unexported here, before the first $(shell) below: SCREEN (`make one-screen`), FILES (`make gate-plan`) and the values
# of the recipes. A recipe reads the raw copy of a value from the environment ("$$REST_TITLE", "$$RAW_TYPE", set below with
# $(value)), never the $(TITLE) text; a guard tests $(value X). FRESH keeps its name for the tools, see below.
unexport SCREEN FILES PR ISSUE TITLE BODY SHARD NAME BRANCH TYPE EPIC PRIORITY RELEASE EVENT JOBS MSG VERSION DIR ARGS
unexport WRITE APPLY DRY_RUN DEMO_SEED_PROFILE PERF_RUNS ONE_SCREEN_WRITE
ifneq ($(origin FRESH),undefined)
FRESH_GIVEN := yes
endif
unexport FRESH
# Test database (E-01: PostgreSQL in Docker). In CI the workflow provides it as a service.
# In a worktree (US-DEV-08) .env.worktree supplies its own port; otherwise the fixed port 54329 is used.
-include .env.worktree
DB_PORT := $(or $(PFLANZENDEX_TEST_DB_PORT),54329)
DB_CONTAINER := pflanzendex-test-db$(if $(PFLANZENDEX_TEST_DB_PORT),-$(DB_PORT))
export PFLANZENDEX_TEST_DATABASE_URL ?= postgres://postgres:postgres@127.0.0.1:$(DB_PORT)/pflanzendex_test
# Memory cap of the local test database: one per worktree on a small dev box (#1084, starting value, assumption).
# Local only: CI provides its own database service, production uses config/deploy. Override with DB_MEMORY=1g. The recipe
# reads the value from RAW_DB_MEMORY (issue 1636), so the unexport below keeps make from expanding a command-line value.
DB_MEMORY ?= 512m
unexport DB_MEMORY
# The local auth server (Keycloak, mail catcher) is one container set shared by every checkout, so it always runs with
# the main checkout's compose file and app/config/dev/.env, also from a worktree (issue 1187, tools/keycloak/dev-env.mjs).
AUTH_DIR := $(dir $(abspath $(shell git rev-parse --git-common-dir)))$(APP)/config/dev
AUTH_COMPOSE := docker compose -f $(AUTH_DIR)/compose.yaml --env-file $(AUTH_DIR)/.env

.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test coverage gates ci ci-gates ci-docs ci-tests ci-tests-base ci-tests-web ci-coverage ci-ui worktree claim board issue issue-check issue-sync status-check retro ci-reuse ci-wait merge auto-merge gate-review migration clean clean-ports repo-stats pr db-up db-down db-reset db-seed pokedex-build migrate auth-up auth-down start stop deploy backup restore-test hooks commitlint secrets workflows image-scan audit release release-dry-run news-release skills-check reference-check principles-review spec-check docs-check release-tags-check changelog-check lighthouse lighthouse-signed perf-nightly browsers conformance e2e one-screen one-screen-report a11y-routes a11y-routes-report crap duplicates dup layout layout-baseline layout-fix db-indexes unused-report storybook build-storybook ds-snapshots ds-snapshots-check bundle-report health-report playwright-version one-screen-merge a11y-routes-merge ui-gates pr-state issue-read pr-text issue-comment gate-plan project-status

# Pull request and issue reads and writes over REST (US-DEV-13): plain targets, so the permission rules can allow them without
# `gh api`, which stays out of the allow list. Code: app/tools/workflow/actions/issue/rest-cli.mjs.
# The inputs travel in the environment as the raw command-line values ($(value) skips make's expansion), and no user text is
# written into a recipe: a backtick, $(...) or a quote in a title, number or path is data, never a shell command (US-DEV-13).
export REST_PR := $(value PR)
export REST_ISSUE := $(value ISSUE)
export REST_TITLE := $(value TITLE)
export REST_BODY := $(value BODY)
# The other caller values of the recipes, raw the same way (issue 1636); the tools get them as arguments, as before. The
# body file is made absolute here, before the recipe changes into app/, from the directory of make.
export RAW_BODY_FILE := $(abspath $(value BODY))
export RAW_BRANCH := $(value BRANCH)
export RAW_DB_MEMORY := $(value DB_MEMORY)
export RAW_DEMO_SEED_PROFILE := $(value DEMO_SEED_PROFILE)
export RAW_DIR := $(value DIR)
export RAW_ARGS := $(value ARGS)
export RAW_EPIC := $(value EPIC)
export RAW_EVENT := $(value EVENT)
export RAW_JOBS := $(value JOBS)
export RAW_MSG := $(value MSG)
export RAW_NAME := $(value NAME)
export RAW_PERF_RUNS := $(value PERF_RUNS)
export RAW_PRIORITY := $(value PRIORITY)
export RAW_RELEASE := $(value RELEASE)
export RAW_SHARD := $(value SHARD)
export RAW_TYPE := $(value TYPE)
export RAW_VERSION := $(value VERSION)
# SCREEN=<id> of `make one-screen` reaches the e2e spec as ONE_SCREEN_ONLY, raw like the REST_ values (issue 1608).
export ONE_SCREEN_ONLY := $(value SCREEN)
# FRESH=1 reaches `npm run gates` as an environment variable (issue 1608). Unset, it stays unset: an exported empty FRESH
# would count as set and never let a green result skip a run. Given (FRESH= too), it reaches the environment as typed, which
# counts as set and runs every step: the safe side. `override export` exports the raw value (issue 1636): a plain assignment
# is ignored for a command-line variable, and the export would then expand it.
ifdef FRESH_GIVEN
override export FRESH := $(value FRESH)
endif
# FILES of `make gate-plan` reach the command raw, like the REST_ values; the unexport of FILES above keeps make from expanding
# them (issue 1608, US-QG-07).
export GATE_PLAN_FILES := $(value FILES)

pr-state: ## Read a PR over REST (PR=<n>): title, state, draft, merged, head, base, auto-merge and the latest check runs of the head (US-DEV-13)
	node $(APP)/tools/workflow/actions/issue/rest-cli.mjs pr-state

issue-read: ## Read an issue over REST (ISSUE=<n>): title, state, labels, assignees and body (US-DEV-13)
	node $(APP)/tools/workflow/actions/issue/rest-cli.mjs issue-read

pr-text: ## Set the title (TITLE="…", optional) and the body (BODY=<file>) of a PR over REST (PR=<n>); refuses a missing or empty body file (US-DEV-13)
	node $(APP)/tools/workflow/actions/issue/rest-cli.mjs pr-text

issue-comment: ## Add a comment to an issue over REST (ISSUE=<n> BODY=<file>); refuses a missing or empty body file (US-DEV-13)
	node $(APP)/tools/workflow/actions/issue/rest-cli.mjs issue-comment

help: ## List all targets with a one-line description
	@grep -hE '^[a-z0-9][a-z0-9-]*:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-20s %s\n", $$1, $$2}'

# node_modules that already match package-lock.json (the check-deps stamp) are kept: in CI they come from the
# node_modules cache (issue 1123, measured saving 30-50 s per job). FRESH=1 always reinstalls.
setup: ## Install dependencies (npm ci, or npm install without a lock file); skipped when node_modules matches the lock file (FRESH=1 forces)
	cd $(APP) && if [ -z "$$FRESH" ] && [ -f package-lock.json ] && node tools/check/supply/check-deps.mjs 2>/dev/null; then \
	  echo "setup: node_modules matches package-lock.json, npm ci skipped (FRESH=1 reinstalls)"; \
	elif [ -f package-lock.json ]; then npm ci; else npm install; fi
	cd $(APP) && node tools/check/supply/check-deps.mjs --stamp
	$(if $(CI),,$(MAKE) hooks)

hooks: ## Enable the git hooks in .githooks/ (commit-msg, pre-commit, pre-push, hints)
	git config core.hooksPath .githooks

commitlint: ## Check a commit message or PR title (MSG="feat(pha): …"), QG-C1
	@# MSG reaches the shell as the raw environment variable RAW_MSG, never through a make expansion of MSG: PR titles are untrusted input.
	@test -n "$$RAW_MSG" || { echo 'usage: make commitlint MSG="feat(pha): …"' >&2; exit 2; }
	@cd $(APP) && printf '%s\n' "$$RAW_MSG" | npx --no-install commitlint --config config/project/commitlint.config.js

changelog-check: ## PR changelog gate (QG-U3); env PR_TITLE, PR_BODY, PR_BASE_SHA, PR_BASE_REF
	@cd $(APP) && npm run --silent changelog

dev: ## Start API and web locally
	cd $(APP) && npm run dev

lint: ## ESLint (file length, complexity, type rules)
	cd $(APP) && npm run lint

format: ## Apply Prettier formatting
	cd $(APP) && npm run format

typecheck: ## Strict TypeScript in all packages
	cd $(APP) && npm run typecheck

docs-check: ## Lint markdown and check relative links (QG-U2)
	cd $(APP) && npm run docs

# The test database is throwaway: db-reset rebuilds it, so durability does not matter. Every start runs it with fsync,
# synchronous_commit and full_page_writes off (issue 1636, owner decision 2026-11-07). Measured on the btrfs volume of the
# Docker host: DROP DATABASE forced a checkpoint that took 18-19 s, up to 12 s of it the disk sync, past the 10 s limit of the
# afterAll hook of the API suite. With the three settings off a checkpoint takes 0.1 s and the API suite 31 s instead of 46-65 s.
# The settings are applied after every start, so a container that `docker start` reuses gets them too: ALTER SYSTEM writes
# postgresql.auto.conf, and all three are reloadable (no restart). CI does not call this target: its Postgres service keeps
# the defaults.
db-up: ## Start the test database (PostgreSQL 18 in Docker) unless it is running; fsync, synchronous_commit and full_page_writes off on every start (issue 1636)
	@docker start $(DB_CONTAINER) >/dev/null 2>&1 || docker run -d --name $(DB_CONTAINER) --memory "$$RAW_DB_MEMORY" \
		-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pflanzendex_test -p 127.0.0.1:$(DB_PORT):5432 postgres:18.6-alpine3.24@sha256:123b17998ccaf47e53b502e8c6a1e79afd8f579c6f3eec83c563da026f957395 >/dev/null
	@until docker exec $(DB_CONTAINER) pg_isready -q -h 127.0.0.1 -d pflanzendex_test; do sleep 1; done
	@docker exec $(DB_CONTAINER) psql -U postgres -q -v ON_ERROR_STOP=1 -c "alter system set fsync = off" -c "alter system set synchronous_commit = off" -c "alter system set full_page_writes = off" -c "select pg_reload_conf()" >/dev/null

db-down: ## Remove the test database with its data (the volume too), so the next db-up starts empty
	-docker rm -f -v $(DB_CONTAINER)

# The local-only targets below change the test database of this worktree and nothing else: each runs
# tools/workflow/worktree/local-database.mjs first, which refuses a DATABASE_URL that is not this database (US-DEV-01).
db-reset: ## Remove the test database of this worktree with its data and migrate a fresh one (local only, refuses any other DATABASE_URL; US-DEV-01)
	cd $(APP) && node tools/workflow/worktree/local-database.mjs $(PFLANZENDEX_TEST_DATABASE_URL)
	$(MAKE) db-down
	$(MAKE) db-up
	$(MAKE) migrate

db-seed: ## Seed the demo accounts test, test2 and test3 into the test database of this worktree (DEMO_SEED_PROFILE=base or states; local only, starts the sign-in service and the database; US-DEV-01)
	cd $(APP) && node tools/workflow/worktree/local-database.mjs $(PFLANZENDEX_TEST_DATABASE_URL)
	$(if $(CI),,$(MAKE) db-up)
	$(MAKE) auth-up
	$(MAKE) migrate
	cd $(APP) && PFLANZENDEX_ENV=local DEMO_SEED_PROFILE="$${RAW_DEMO_SEED_PROFILE:-base}" npm run seed:demo -w @pflanzendex/api

pokedex-build: ## Run the taxonomy build once on the test database of this worktree (US-POK-03); DRY_RUN=1 compares with the stored tree and sends no request, otherwise it asks OpenTree, Wikidata, Wikipedia and GBIF (needs network)
	cd $(APP) && node tools/workflow/worktree/local-database.mjs $(PFLANZENDEX_TEST_DATABASE_URL)
	$(if $(CI),,$(MAKE) db-up)
	$(MAKE) migrate
	cd $(APP) && npm run taxonomy:build -w @pflanzendex/api $(if $(value DRY_RUN),-- --dry-run)

migrate: ## Apply migrations (DATABASE_URL, otherwise the test database)
	cd $(APP) && npm run migrate -w @pflanzendex/db

migration: ## New migration with the next free number, seen from origin/dev and all open PRs (NAME=<module>_<short_name>, issue #831)
	cd $(APP) && node tools/workflow/claim/migration/new-migration.mjs "$$RAW_NAME"

auth-up: ## Start the shared auth server (Keycloak) and mail catcher; admin password in the main checkout's app/config/dev/.env (not in the repo, only the main checkout creates it; refuses on a password mismatch)
	cd $(APP) && node tools/keycloak/auth-up.mjs
	@for i in $$(seq 60); do curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null && break; sleep 2; done; curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null || { echo "Keycloak is not responding"; exit 1; }
	@echo "Keycloak: http://localhost:18081 (realm pflanzendex), mail: http://localhost:18025"

auth-down: ## Remove the auth server and mail catcher
	-$(AUTH_COMPOSE) down -v

start: auth-up db-up ## Start everything for local work: auth server, database, API and web; prints URLs and test accounts
	@for i in $$(seq 60); do curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null && docker exec $(DB_CONTAINER) pg_isready -q -d pflanzendex_test && break; sleep 2; done; curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null && docker exec $(DB_CONTAINER) pg_isready -q -d pflanzendex_test || { echo "Keycloak or the database is not responding"; exit 1; }
	@echo "Web: http://localhost:5173  API: http://localhost:3000  Keycloak: http://localhost:18081  Mail: http://localhost:18025"
	@echo "Test accounts (dev realm): test, test2, test3 - password testtest12 (see docs/guides/reference/app.md)"
	$(MAKE) dev

stop: ## Stop the local auth server, mail catcher and database containers (data is kept)
	-$(AUTH_COMPOSE) stop
	-docker stop $(DB_CONTAINER)

test: $(if $(CI),,db-up) ## Unit and database tests of all packages and check scripts
	cd $(APP) && npm run test

coverage: $(if $(CI),,db-up) ## Run all tests with coverage, then the ratchet check (thresholds: app/config/gates/coverage-thresholds.json)
	cd $(APP) && npm run coverage

browsers: ## Install the Chromium that Playwright uses (e2e, conformance run); CI: the system packages and the download are time-limited and retried once (US-QG-01)
	cd $(APP) && $(if $(CI),sh ../tools/lighthouse/install-browsers.sh,npx --no-install playwright install chromium)

playwright-version: ## Print the installed version of Playwright (the key of the CI cache of the browser's system packages, US-QG-01)
	@cd $(APP) && node -p "require('./node_modules/@playwright/test/package.json').version"

conformance: ## Component conformance over all stories: axe, 44 px targets, focus, overlays; light and dark, 360 px; 8 pages at once, CONFORMANCE_PAGES=<n> overrides (QG-U5, FR-QG-09; needs `make browsers`; report only until it is switched to blocking)
	cd $(APP) && npm run conformance

ds-snapshots-check: ## Visual regression in the pinned Playwright container: components/ui stories (360 px, .storybook/snapshots) and page stories (5 sizes, .storybook/page-snapshots), light and dark; also runs its self-test (QG-U5, US-QS-07, FR-QG-27; needs Docker)
	cd $(APP) && npm run ds-snapshots

ds-snapshots: ## Rewrite the baselines of the ui stories and of the page stories (pinned Playwright container, needs Docker); review the images, then commit them (QG-U5, US-QS-07, FR-QG-27)
	cd $(APP) && npm run ds-snapshots:update

e2e: $(if $(CI),,db-up) auth-up migrate browsers ## End-to-end tests with Playwright, mobile + desktop, axe blocks on serious/critical (QG-T3, QG-U1; needs Docker)
	cd $(APP) && npm run e2e

one-screen: $(if $(and $(value SCREEN),$(value SHARD)),$(error one-screen: SCREEN cannot be combined with SHARD: one screen is a partial run, not a shard of the gate)) $(if $(and $(value SCREEN),$(filter 1,$(value ONE_SCREEN_WRITE))),$(error one-screen: SCREEN cannot be combined with ONE_SCREEN_WRITE=1: a partial run never rewrites the baseline)) $(if $(CI),,db-up) auth-up migrate browsers ## Every view and layer fits the window at 360x640 to 1920x1080, 1920 px width cap at 2560 (QG-U8, US-QS-15, DS-58); seeds the demo (DEMO_SEED_PROFILE=states); TAXONOMY_BUILD=off keeps foreign servers out (the states seed brings a Pokédex tree fixture, issue 1164); ONE_SCREEN_WORKERS=<n>, SHARD=<i>/<n> runs the screens of shard i of n (the split of the register, US-QG-01), SCREEN=<id> measures one screen only (issue 1608; refused with SHARD or ONE_SCREEN_WRITE=1, before anything starts), `npm run one-screen:write` rewrites the baseline; needs Docker
	cd $(APP) && PFLANZENDEX_ENV=local DEMO_SEED_PROFILE=states npm run seed:demo -w @pflanzendex/api
	cd $(APP) && TAXONOMY_BUILD=off ONE_SCREEN_SHARD="$$RAW_SHARD" npm run one-screen

one-screen-report: ## The page/inner table of the last `make one-screen` run as Markdown (job summary); report only, never fails (QG-U8)
	@cat $(APP)/packages/e2e/one-screen-report/report.md 2>/dev/null || echo "No one-screen report: run make one-screen first."

one-screen-merge: ## CI only: merges the shard reports of one-screen (app/packages/e2e/one-screen-shards) into the report of the whole run; fails unless every screen and size was measured exactly once (US-QG-01)
	cd $(APP) && npm run --silent merge-shards -w @pflanzendex/e2e -- one-screen one-screen-shards

a11y-routes: $(if $(CI),,db-up) auth-up migrate browsers ## axe and keyboard walk over every view and layer at 390x844 and 1920x1080 (QG-U7, FR-QG-24); seeds the demo (DEMO_SEED_PROFILE=states); TAXONOMY_BUILD=off keeps foreign servers out; A11Y_ROUTES_WORKERS=<n>, SHARD=<i>/<n> runs the screens of shard i of n (the split of the register, US-QG-01), `npm run a11y-routes:write` rewrites the baseline, `npm run a11y-routes:baseline -- <results.json>` builds it from a CI artifact; needs Docker
	cd $(APP) && PFLANZENDEX_ENV=local DEMO_SEED_PROFILE=states npm run seed:demo -w @pflanzendex/api
	cd $(APP) && TAXONOMY_BUILD=off A11Y_ROUTES_SHARD="$$RAW_SHARD" npm run a11y-routes

ui-gates: $(if $(value SCREEN),$(error ui-gates: SCREEN measures one screen, use make one-screen SCREEN=<id>; the gates of CI run the screens of one shard, SHARD=<i>/<n>)) $(if $(CI),,db-up) auth-up migrate browsers ## CI only (US-QG-01): both UI gates in one pass over the screens of SHARD=<i>/<n>, the split of the register; the demo is seeded once, then one-screen runs and a11y-routes runs too when one-screen failed; exit 1 when either gate failed; needs Docker
	cd $(APP) && PFLANZENDEX_ENV=local DEMO_SEED_PROFILE=states npm run seed:demo -w @pflanzendex/api
	cd $(APP) || exit 1; rc=0; TAXONOMY_BUILD=off ONE_SCREEN_SHARD="$$RAW_SHARD" npm run one-screen || rc=1; TAXONOMY_BUILD=off A11Y_ROUTES_SHARD="$$RAW_SHARD" npm run a11y-routes || rc=1; exit $$rc

a11y-routes-report: ## The findings per rule and per screen of the last `make a11y-routes` run as Markdown (job summary); report only, never fails (QG-U7)
	@cat $(APP)/packages/e2e/a11y-routes-report/report.md 2>/dev/null || echo "No a11y-routes report: run make a11y-routes first."

a11y-routes-merge: ## CI only: merges the shard reports of a11y-routes (app/packages/e2e/a11y-routes-shards) into the report of the whole run; fails unless every screen and size was measured exactly once (US-QG-01)
	cd $(APP) && npm run --silent merge-shards -w @pflanzendex/e2e -- a11y-routes a11y-routes-shards

crap: ## CRAP gate on functions in changed files (QG-K3; needs coverage output, run `make coverage` first; `ARGS=--all` for the whole project)
	cd $(APP) && node tools/check/quality/check-crap.mjs $$RAW_ARGS

spec-check: ## Spec consistency and story-to-test traceability (QG-T4)
	cd $(APP) && npm run specs

skills-check: ## Check agent skills in .agents/skills (trigger, paths, check command, links; US-DEV-04)
	cd $(APP) && npm run skills

reference-check: ## API routes and core operations named in app.md, shared components in design-system.md; baseline only shrinks (QG-T5, US-QG-10)
	cd $(APP) && npm run reference

principles-review: ## Quarterly review of the principles register: gated and checked entries without a Caught line of the last three months; report only, exit 0 (US-QG-06)
	cd $(APP) && npm run principles-review

storybook: ## Component catalog (Storybook) on http://localhost:6006, light/dark toolbar, 360 px viewport (TE-18)
	cd $(APP) && npm run storybook

build-storybook: ## Build the component catalog to app/packages/web/node_modules/.cache/storybook (TE-18)
	cd $(APP) && npm run build-storybook

lighthouse: ## Lighthouse on the built web app, mobile, median of 3 runs against the limits in app/config/gates/quality-limits.json; fails past a limit (QG-U1, FR-QG-09), plus the initial JS budget as report (QG-U6); report in app/packages/web/.lighthouseci
	cd $(APP) && npm run build -w @pflanzendex/web
	cd $(APP) && npm run bundle-budget -- --report
	tools/lighthouse/lighthouse-run.sh
	@summary=$(APP)/packages/web/.lighthouseci/summary.md; tools/lighthouse/lighthouse-summary.sh --check > $$summary; status=$$?; cat $$summary; exit $$status

lighthouse-signed: $(if $(CI),,db-up) auth-up migrate browsers ## Lighthouse on the signed-in /today and /collection, mobile, median of 3 runs; report only: scores never fail it, a run that cannot measure does (FR-QG-09, issue 1251); seeds the demo
	cd $(APP) && PFLANZENDEX_ENV=local DEMO_SEED_PROFILE=states npm run seed:demo -w @pflanzendex/api
	tools/lighthouse/lighthouse-signed.sh

perf-nightly: $(if $(CI),,db-up) ## Load measurement of every GET route at 1,000 specimens against the budgets in app/config/gates/quality-limits.json (`perf`), plus the concurrency probe (1/4/8/16 Heute screens); report only: a budget never fails it, a broken measurement does (NFR-12, issue 1250); output in app/.cache/perf
	@mkdir -p $(APP)/.cache/perf
	cd $(APP) && PERF_SIZES=1000 PERF_SPECIES=100 PERF_RUNS="$${RAW_PERF_RUNS:-20}" npm run --silent perf:measure -w @pflanzendex/api > .cache/perf/measure.json
	cd $(APP) && PERF_USERS=1,4,8,16 npm run --silent perf:concurrency -w @pflanzendex/api > .cache/perf/concurrency.txt
	@cd $(APP)/packages/api && npx --no-install tsx perf/load/budget-report.ts ../../.cache/perf/measure.json > ../../.cache/perf/summary.md; status=$$?; \
	  printf '\n### Concurrency, Heute screen (/today + /specimens/hints)\n\n```text\n' >> ../../.cache/perf/summary.md; \
	  cat ../../.cache/perf/concurrency.txt >> ../../.cache/perf/summary.md; printf '```\n' >> ../../.cache/perf/summary.md; \
	  cat ../../.cache/perf/summary.md; exit $$status

bundle-report: ## Initial JS per chunk and package as Markdown against the 125 kB goal; report only, never fails (QG-U6, FR-QG-10)
	@cd $(APP) && npm run --silent bundle-report

health-report: ## The five most complex functions (cognitive complexity) as Markdown for the CI job summary; report only (US-QG-08)
	@cd $(APP) && npm run --silent health

release-tags-check: ## All v* tags come from the release workflow, no hand-set version (FR-DEV-05; needs gh auth)
	cd $(APP) && npm run release-tags

secrets: ## Secret scan over the full git history (gitleaks, QG-S1)
	tools/lint/gitleaks.sh

workflows: ## Lint GitHub workflows (actionlint)
	tools/lint/actionlint.sh

image-scan: ## Vulnerability scan of every container image (Grype), report only (#761, NFR-10); report in app/.cache/image-scan.md
	tools/lint/image-scan.sh

audit: ## Known high-severity vulnerabilities in dependencies (npm audit, QG-S2)
	cd $(APP) && npm run audit

unused-report: ## Code only reachable from tests and unused dependencies, report only (QG-C6, US-DEV-03); report in app/.cache/unused-report.md
	cd $(APP) && npm run unused-report

duplicates: ## Clone groups with 3+ copies in changed files block, whole project is reported (QG-K4; base DUPLICATES_BASE, default origin/dev)
	cd $(APP) && npm run duplicates

dup: ## Share of duplicated lines in the whole project (jscpd), ratchet toward 1 % (QG-K5, FR-QG-10; config app/.jscpd.json, limit in app/config/gates/quality-limits.json)
	cd $(APP) && npm run dup

layout: ## File layout: at most 5 units per directory, names, component folders, baseline ratchet (QG-C4, US-QG-09)
	cd $(APP) && npm run layout

layout-fix: ## Fix the layout of DIR=<dir> or move files: ARGS="--move <from>=<to>"; dry run, APPLY=1 applies (FR-QG-23)
	cd $(APP) && node tools/layout-fix/layout-fix.mjs $$RAW_DIR $(if $(value APPLY),--apply) $$RAW_ARGS

layout-baseline: ## Create or lower app/config/gates/baselines/layout-baseline.json, never enlarge it (FR-QG-22)
	cd $(APP) && npm run layout -- --write-baseline

db-indexes: ## Every foreign key and tenant column (account_id) of the migrations has an index, baseline ratchet (US-QG-07)
	cd $(APP) && npm run db-indexes

gates: secrets workflows ## Fast gates: secrets, workflows, lint, types, boundaries, unused code, format; a green result of this exact content is skipped (FRESH=1 runs all, issue 1608)
	cd $(APP) && node tools/check/supply/check-deps.mjs
	cd $(APP) && npm run gates

# Declares the gate files that a branch will change, before the first edit of them (US-QG-07). The Claude Code hook then asks
# one question that lists the whole plan. The paths are relative to the top of the worktree. It confirms nothing.
gate-plan: ## Declares the gate files this branch will change (FILES="a b", paths from the top of the worktree; US-QG-07): one question then covers the list, and nothing is confirmed
	node .claude/hooks/gate-plan.mjs

# The local run of every part, one at a time, and every part also after a failure (US-QG-02, issue 1636). The parts, their
# order and their dependencies are CI_PARTS in app/tools/check/quality/gates/gate-steps.mjs; the runner is app/tools/dev/agent/ci-parts.mjs.
ci: ## All parts of the local CI in order (secrets, workflows, database, gates, tests, coverage, UI build); every part runs, every failure is listed at the end, exit 1 when one failed (US-QG-02)
	cd $(APP) && npm run ci

# The parts of `make ci`; CI runs them as parallel jobs (US-QG-02, #1118), locally `make ci` runs them one at a time.
ci-gates: secrets workflows ## Part 1 of `make ci`: secrets, workflows and the fast gates
	cd $(APP) && npm run ci:gates

# The docs and spec part of `make gates` on its own: CI job `docs-gates` runs it for a change to documentation (US-QG-02, #1389).
ci-docs: ## Docs and spec gates (markdown lint and links, spec checks, spec numbers, principles, skills, reference); CI job docs-gates
	cd $(APP) && npm run ci:docs

ci-tests: $(if $(CI),,db-up) ## Part 2 of `make ci`: all tests with coverage and the ratchet, then the CRAP check
	cd $(APP) && npm run ci:tests

# Part 2 in CI as three jobs (issue 1125): the web suite runs beside the others, the ratchet and CRAP check read both
# coverage outputs afterwards. Together they are exactly `make ci-tests`.
ci-tests-base: $(if $(CI),,db-up) ## Part 2a: api, core and db tests with coverage, plus the tool tests
	cd $(APP) && npm run ci:tests:base

ci-tests-web: ## Part 2b: web tests with coverage
	cd $(APP) && npm run ci:tests:web

ci-coverage: ## Part 2c: coverage ratchet and CRAP check over the coverage of all packages (run 2a and 2b first)
	cd $(APP) && npm run ci:coverage

ci-ui: ## Part 3 of `make ci`: build, initial JS budget and the blocking conformance run (needs `make browsers`)
	cd $(APP) && npm run ci:ui

release: ## Version, tag and GitHub release from the commits (CI on main only, US-DEV-06)
	@test -n "$(CI)" || { echo "release only runs in CI; locally use: make release-dry-run" >&2; exit 2; }
	cd $(APP) && npx --no-install semantic-release

release-dry-run: ## Show the next version and notes without publishing (BRANCH=dev)
	cd $(APP) && GITHUB_TOKEN="$${GITHUB_TOKEN:-$$(gh auth token)}" npx --no-install semantic-release \
		--dry-run --no-ci --branches "$${RAW_BRANCH:-$$(git branch --show-current)}"

news-release: ## Cut the unreleased news lines into version VERSION=<x.y.z> of news.de.json and delete their fragments; commit both in one commit (US-DEV-06)
	@test -n "$$RAW_VERSION" || { echo "news-release: set VERSION=<x.y.z>, the version release-dry-run prints" >&2; exit 2; }
	node tools/repo/news-release.mjs "$$RAW_VERSION"

worktree: ## New worktree and branch (BRANCH=feat/x) with its own ports; claim check first (opt-out SKIP_CLAIM_CHECK=1, US-DEV-08)
	tools/repo/worktree-new.sh "$$RAW_BRANCH"

ci-reuse: ## CI only: reuse a green job (JOBS="app ds-snapshots") of the same PR head commit after a title/body edit (US-QG-02, #404)
	cd $(APP) && node tools/workflow/actions/ci-reuse/ci-reuse.mjs $$RAW_JOBS

ci-wait: ## Wait until every check of a PR head has finished, then print the real result per job (PR=<n>; exit 1 on a failure, a conflict or a required job that never ran; US-DEV-13)
	cd $(APP) && node tools/workflow/actions/ci-reuse/ci-wait.mjs "$$REST_PR"

merge: ## Merge a PR into dev as an agent (PR=<n>): green ci-status, known story, no gate file (ADR 0005)
	cd $(APP) && node tools/workflow/merge-pr.mjs "$$REST_PR"

auto-merge: ## Wait for the CI of a PR (PR=<n>), then merge it with every make merge check; a gate PR is refused at the end, after CI; red CI merges nothing; never arms GitHub auto-merge; it runs in the session's background, so it ends with that session and the PR then stays open, nothing half done (US-DEV-13)
	cd $(APP) && node tools/workflow/actions/ci-reuse/ci-wait.mjs "$$REST_PR" && node tools/workflow/merge-pr.mjs "$$REST_PR"

gate-review: ## Open PRs into dev that change a gate file: CI as it stands, conflicts, age, whether a limit, baseline or allowlist moved looser (read-only, US-QG-07)
	cd $(APP) && node tools/workflow/actions/ci-reuse/gate-review/gate-review.mjs

repo-stats: ## Regenerate the statistics block in README.md (once per release PR, see release-checklist; US-DEV-10)
	tools/repo/repo-stats.sh

pr: ## Before review (PR=<n> optional): push and mark the PR ready (US-DEV-13)
	tools/repo/pr-ready.sh "$$REST_PR"

claim: ## Claim a story before working on it (ISSUE=<n>): assignee, status, branch, draft PR; refuses duplicate work (US-DEV-08)
	cd $(APP) && node tools/workflow/claim/claim.mjs "$$REST_ISSUE"

issue: ## New issue with type and epic labels and the board fields Typ, Epic, Priority, Release and Status Todo (TYPE=story EPIC=ACC PRIORITY=P1 TITLE="…" BODY=<file.md> [RELEASE=R3]); Release by rule (bug by priority P0/P1 R1, P2 R2, P3 R4; epic none; other types R2) unless RELEASE overrides it; refuses unknown values before creating anything (FR-DEV-10)
	cd $(APP) && node tools/workflow/actions/issue/issue-cli.mjs create --type "$$RAW_TYPE" --epic "$$RAW_EPIC" --priority "$$RAW_PRIORITY" --title "$$REST_TITLE" --body-file "$$RAW_BODY_FILE" $(if $(value RELEASE),--release "$$RAW_RELEASE")

issue-check: ## Check the type and epic labels of an issue (ISSUE=<n> [EVENT=opened|edited|labeled|unlabeled]): comment and needs-triage when invalid, needs-triage removed when valid (CI: issue-check.yml, FR-DEV-10)
	cd $(APP) && node tools/workflow/actions/issue/issue-cli.mjs check --issue "$$REST_ISSUE" --event "$$RAW_EVENT"

issue-sync: ## Set the board fields Typ and Epic of an issue, and Status Todo when it has none (ISSUE=<n> TYPE=<label> EPIC=<code>); CI runs it with the project token (FR-DEV-10)
	cd $(APP) && node tools/workflow/actions/issue/issue-cli.mjs sync --issue "$$REST_ISSUE" --type "$$RAW_TYPE" --epic "$$RAW_EPIC"

project-status: ## Move the project status of the PR that was merged or closed (CI: project-status.yml, US-DEV-05); the GitHub App token comes in GH_TOKEN
	node $(APP)/tools/workflow/actions/project-status/project-status.mjs event "$$GITHUB_EVENT_PATH"

board: ## Who works on which open story of a release (board field Release, RELEASE="R1 Parität"); flags STALE and DOUBLE (CLAIM_STALE_HOURS, US-DEV-08)
	cd $(APP) && node tools/workflow/board.mjs "$$RAW_RELEASE"

status-check: ## Project status vs. pull requests, open items without a status, missing priorities (US-DEV-05); exit 1 on drift
	cd $(APP) && node tools/workflow/actions/project-status/project-status.mjs check

retro: ## Issue flow retro: created vs. closed per day, burndown (US-DEV-11); prints it, WRITE=1 rewrites the pinned report issue
	cd $(APP) && node tools/workflow/actions/retro/retro.mjs $(if $(value WRITE),--write)

clean: ## Remove build output and node_modules
	cd $(APP) && rm -rf node_modules packages/*/node_modules packages/*/dist

clean-ports: ## Stop the processes that listen on the dev ports of this worktree (API and web; only your own processes, each one named; 3000 and 5173 in the main checkout; US-DEV-01)
	cd $(APP) && node tools/workflow/worktree/clean-ports.mjs

deploy: ## Build and start staging from origin/main (on the host, needs app/config/deploy/.env)
	$(APP)/config/deploy/scripts/deploy.sh

backup: ## Back up the database (app/config/deploy/backups)
	$(APP)/config/deploy/scripts/backup.sh

restore-test: ## Restore test in a throwaway container (needs Docker)
	$(APP)/config/deploy/scripts/restore/restore-test.sh
