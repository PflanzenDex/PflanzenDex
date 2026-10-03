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
.PHONY: help setup dev lint format typecheck test gates ci worktree clean db-up db-down migrate auth-up auth-down deploy backup restore-test

help: ## List all targets with a one-line description
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## Install dependencies (npm ci, or npm install without a lock file)
	cd $(APP) && if [ -f package-lock.json ]; then npm ci; else npm install; fi

dev: ## Start API and web locally
	cd $(APP) && npm run dev

lint: ## ESLint (file length, complexity, type rules)
	cd $(APP) && npm run lint

format: ## Apply Prettier formatting
	cd $(APP) && npm run format

typecheck: ## Strict TypeScript in all packages
	cd $(APP) && npm run typecheck

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

gates: ## Fast gates: lint, types, architecture boundaries, format
	cd $(APP) && npm run gates

ci: $(if $(CI),,db-up) ## All gates in CI order, stops at the first failure
	cd $(APP) && npm run ci

worktree: ## New worktree and branch (BRANCH=feat/x) with its own ports (US-DEV-08)
	scripts/worktree-new.sh "$(BRANCH)"

clean: ## Remove build output and node_modules
	cd $(APP) && rm -rf node_modules packages/*/node_modules packages/*/dist

deploy: ## Build and start staging from origin/main (on the host, needs app/deploy/.env)
	$(APP)/deploy/scripts/deploy.sh

backup: ## Back up the database (app/deploy/backups)
	$(APP)/deploy/scripts/backup.sh

restore-test: ## Restore test in a throwaway container (needs Docker)
	$(APP)/deploy/scripts/restore-test.sh
