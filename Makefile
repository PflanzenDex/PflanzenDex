# Ein Einstieg für alle Aufgaben (US-DEV-01). Lokal und in der CI laufen dieselben Ziele (FR-QG-01).
# Das Makefile enthält keine Fachlogik, nur Aufrufe; ein Fehler bricht ab und wird nie verdeckt (D-05).
APP := app
# Test-Datenbank (E-01: PostgreSQL in Docker). In der CI stellt der Workflow sie als Dienst bereit.
# Im Worktree (US-DEV-08) liefert .env.worktree einen eigenen Port; sonst bleibt es beim festen Port 54329.
-include .env.worktree
DB_PORT := $(or $(PFLANZENDEX_TEST_DB_PORT),54329)
DB_CONTAINER := pflanzendex-test-db$(if $(PFLANZENDEX_TEST_DB_PORT),-$(DB_PORT))
export PFLANZENDEX_TEST_DATABASE_URL ?= postgres://postgres:postgres@127.0.0.1:$(DB_PORT)/pflanzendex_test

.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test gates ci worktree clean db-up db-down migrate auth-up auth-down deploy backup restore-test secrets workflows audit

help: ## Alle Ziele mit einem Satz
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## Abhängigkeiten installieren (npm ci, ohne Lockfile npm install)
	cd $(APP) && if [ -f package-lock.json ]; then npm ci; else npm install; fi

dev: ## API und Web lokal starten
	cd $(APP) && npm run dev

lint: ## ESLint (Dateilänge, Komplexität, Typregeln)
	cd $(APP) && npm run lint

format: ## Prettier schreibt die Formatierung
	cd $(APP) && npm run format

typecheck: ## TypeScript strict in allen Paketen
	cd $(APP) && npm run typecheck

db-up: ## Test-Datenbank (PostgreSQL 16 in Docker) starten, falls sie nicht läuft
	@docker start $(DB_CONTAINER) >/dev/null 2>&1 || docker run -d --name $(DB_CONTAINER) \
		-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pflanzendex_test -p 127.0.0.1:$(DB_PORT):5432 postgres:16-alpine >/dev/null
	@until docker exec $(DB_CONTAINER) pg_isready -q -d pflanzendex_test; do sleep 1; done

db-down: ## Test-Datenbank entfernen
	-docker rm -f $(DB_CONTAINER)

migrate: ## Migrationen anwenden (DATABASE_URL, sonst die Test-Datenbank)
	cd $(APP) && npm run migrate -w @pflanzendex/db

auth-up: ## Anmeldedienst (Keycloak) und Mail-Fänger starten; Admin-Passwort in app/dev/.env (nicht im Repo)
	@test -f $(APP)/dev/.env || echo "KC_ADMIN_PASSWORD=$$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)" > $(APP)/dev/.env
	docker compose -f $(APP)/dev/compose.yaml --env-file $(APP)/dev/.env up -d
	@for i in $$(seq 60); do curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null && break; sleep 2; done; curl -sf http://localhost:18081/realms/pflanzendex/.well-known/openid-configuration >/dev/null || { echo "Keycloak antwortet nicht"; exit 1; }
	@echo "Keycloak: http://localhost:18081 (Realm pflanzendex), Mails: http://localhost:18025"

auth-down: ## Anmeldedienst und Mail-Fänger entfernen
	-docker compose -f $(APP)/dev/compose.yaml --env-file $(APP)/dev/.env down -v

test: $(if $(CI),,db-up) ## Unit- und Datenbanktests aller Pakete und der Prüfskripte
	cd $(APP) && npm run test

secrets: ## Secret scan over the full git history (gitleaks, QG-S1)
	scripts/gitleaks.sh

workflows: ## Lint GitHub workflows (actionlint)
	scripts/actionlint.sh

audit: ## Known high-severity vulnerabilities in dependencies (npm audit, QG-S2)
	cd $(APP) && npm run audit

gates: secrets workflows ## Fast gates: secrets, workflows, lint, types, boundaries, unused code, format
	cd $(APP) && npm run gates

ci: secrets workflows $(if $(CI),,db-up) ## Alle Gates in der Reihenfolge der CI, bricht beim ersten Fehler ab
	cd $(APP) && npm run ci

worktree: ## Neuer Worktree + Branch (BRANCH=feat/x) mit eigenen Ports (US-DEV-08)
	scripts/worktree-new.sh "$(BRANCH)"

clean: ## Build-Ausgaben und node_modules entfernen
	cd $(APP) && rm -rf node_modules packages/*/node_modules packages/*/dist

deploy: ## Staging aus origin/main bauen und starten (auf dem Host, braucht app/deploy/.env)
	$(APP)/deploy/scripts/deploy.sh

backup: ## Datenbank sichern (app/deploy/backups)
	$(APP)/deploy/scripts/backup.sh

restore-test: ## Wiederherstellungstest in Wegwerf-Container (braucht Docker)
	$(APP)/deploy/scripts/restore-test.sh
