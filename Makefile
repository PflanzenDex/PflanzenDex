# One entry point for every task (US-DEV-01). Local runs and CI use the same targets (FR-QG-01).
# The Makefile holds no domain logic, only calls; an error stops the run and is never hidden (D-05).
APP := app
# Test database (E-01: PostgreSQL in Docker). In CI the workflow provides it as a service.
# In a worktree (US-DEV-08) .env.worktree supplies its own port; otherwise the fixed port 54329 is used.
-include .env.worktree
DB_PORT := $(or $(PFLANZENDEX_TEST_DB_PORT),54329)
DB_CONTAINER := pflanzendex-test-db$(if $(PFLANZENDEX_TEST_DB_PORT),-$(DB_PORT))
export PFLANZENDEX_TEST_DATABASE_URL ?= postgres://postgres:postgres@127.0.0.1:$(DB_PORT)/pflanzendex_test

.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test coverage gates ci worktree claim board clean db-up db-down migrate auth-up auth-down deploy backup restore-test hooks commitlint secrets workflows audit release release-dry-run skills-check spec-check docs-check release-tags-check changelog-check lighthouse e2e crap duplicates

help: ## List all targets with a one-line description
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## Install dependencies (npm ci, or npm install without a lock file)
	cd $(APP) && if [ -f package-lock.json ]; then npm ci; else npm install; fi
	$(if $(CI),,$(MAKE) hooks)

hooks: ## Enable the git hooks in .githooks/ (commit-msg, pre-commit, pre-push, hints)
	git config core.hooksPath .githooks

commitlint: ## Check a commit message or PR title (MSG="feat(pha): …"), QG-C1
	@# MSG reaches the shell as an environment variable, never through $$(MSG) expansion: PR titles are untrusted input.
	@test -n "$$MSG" || { echo 'usage: make commitlint MSG="feat(pha): …"' >&2; exit 2; }
	@cd $(APP) && printf '%s\n' "$$MSG" | npx --no-install commitlint

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

db-up: ## Start the test database (PostgreSQL 16 in Docker) unless it is running
	@docker start $(DB_CONTAINER) >/dev/null 2>&1 || docker run -d --name $(DB_CONTAINER) \
		-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pflanzendex_test -p 127.0.0.1:$(DB_PORT):5432 postgres:16-alpine >/dev/null
	@until docker exec $(DB_CONTAINER) pg_isready -q -d pflanzendex_test; do sleep 1; done

db-down: ## Remove the test database
	-docker rm -f $(DB_CONTAINER)

migrate: ## Apply migrations (DATABASE_URL, otherwise the test database)
	cd $(APP) && npm run migrate -w @pflanzendex/db

auth-up: ## Start the auth server (Keycloak) and mail catcher; admin password in app/dev/.env (not in the repo)
	@test -f $(APP)/dev/.env || echo "KC_ADMIN_PASSWORD=$$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)" > $(APP)/dev/.env
	docker compose -f $(APP)/dev/compose.yaml --env-file $(APP)/dev/.env up -d
	@for i in $$(seq 60); do curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null && break; sleep 2; done; curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null || { echo "Keycloak is not responding"; exit 1; }
	@echo "Keycloak: http://localhost:18081 (realm pflanzendex), mail: http://localhost:18025"

auth-down: ## Remove the auth server and mail catcher
	-docker compose -f $(APP)/dev/compose.yaml --env-file $(APP)/dev/.env down -v

test: $(if $(CI),,db-up) ## Unit and database tests of all packages and check scripts
	cd $(APP) && npm run test

coverage: $(if $(CI),,db-up) ## Run all tests with coverage, then the ratchet check (thresholds: app/coverage-thresholds.json)
	cd $(APP) && npm run coverage

e2e: $(if $(CI),,db-up) auth-up migrate ## End-to-end tests with Playwright, mobile + desktop, axe as report (QG-T3, QG-U1; needs Docker)
	cd $(APP) && npx --no-install playwright install $(if $(CI),--with-deps) chromium
	cd $(APP) && npm run e2e

crap: ## CRAP gate on functions in changed files (QG-K3; needs coverage output, run `make coverage` first; `ARGS=--all` for the whole project)
	cd $(APP) && node scripts/check-crap.mjs $(ARGS)

spec-check: ## Spec consistency and story-to-test traceability (QG-T4)
	cd $(APP) && npm run specs

skills-check: ## Check agent skills in .agents/skills (trigger, paths, check command, links; US-DEV-04)
	cd $(APP) && npm run skills

lighthouse: ## Lighthouse CI on the built web app, mobile, report only (QG-U1); report in app/packages/web/.lighthouseci
	cd $(APP) && npm run build -w @pflanzendex/web
	scripts/lighthouse-run.sh
	scripts/lighthouse-summary.sh | tee $(APP)/packages/web/.lighthouseci/summary.md

release-tags-check: ## All v* tags come from the release workflow, no hand-set version (FR-DEV-05; needs gh auth)
	cd $(APP) && npm run release-tags

secrets: ## Secret scan over the full git history (gitleaks, QG-S1)
	scripts/gitleaks.sh

workflows: ## Lint GitHub workflows (actionlint)
	scripts/actionlint.sh

audit: ## Known high-severity vulnerabilities in dependencies (npm audit, QG-S2)
	cd $(APP) && npm run audit

duplicates: ## Clone groups with 3+ copies in changed files block, whole project is reported (QG-K4; base DUPLICATES_BASE, default origin/dev)
	cd $(APP) && npm run duplicates

gates: secrets workflows ## Fast gates: secrets, workflows, lint, types, boundaries, unused code, format
	cd $(APP) && npm run gates

ci: secrets workflows $(if $(CI),,db-up) ## All gates in CI order, stops at the first failure
	cd $(APP) && npm run ci

release: ## Version, tag and GitHub release from the commits (CI on main only, US-DEV-06)
	@test -n "$(CI)" || { echo "release only runs in CI; locally use: make release-dry-run" >&2; exit 2; }
	cd $(APP) && npx --no-install semantic-release

release-dry-run: ## Show the next version and notes without publishing (BRANCH=dev)
	cd $(APP) && GITHUB_TOKEN="$${GITHUB_TOKEN:-$$(gh auth token)}" npx --no-install semantic-release \
		--dry-run --no-ci --branches "$${BRANCH:-$$(git branch --show-current)}"

worktree: ## New worktree and branch (BRANCH=feat/x) with its own ports; claim check first (opt-out SKIP_CLAIM_CHECK=1, US-DEV-08)
	scripts/worktree-new.sh "$(BRANCH)"

claim: ## Claim a story before working on it (ISSUE=<n>): assignee, status, branch, draft PR; refuses duplicate work (US-DEV-08)
	cd $(APP) && node scripts/claim.mjs "$(ISSUE)"

board: ## Who works on which open story of the milestone; flags STALE and DOUBLE (CLAIM_STALE_HOURS, US-DEV-08)
	cd $(APP) && node scripts/board.mjs $(MILESTONE)

clean: ## Remove build output and node_modules
	cd $(APP) && rm -rf node_modules packages/*/node_modules packages/*/dist

deploy: ## Build and start staging from origin/main (on the host, needs app/deploy/.env)
	$(APP)/deploy/scripts/deploy.sh

backup: ## Back up the database (app/deploy/backups)
	$(APP)/deploy/scripts/backup.sh

restore-test: ## Restore test in a throwaway container (needs Docker)
	$(APP)/deploy/scripts/restore-test.sh
