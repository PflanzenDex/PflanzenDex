# Ein Einstieg für alle Aufgaben (US-DEV-01). Lokal und in der CI laufen dieselben Ziele (FR-QG-01).
# Das Makefile enthält keine Fachlogik, nur Aufrufe; ein Fehler bricht ab und wird nie verdeckt (D-05).
APP := app

.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test gates ci clean deploy backup restore-test

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

test: ## Unit-Tests aller Pakete und der Prüfskripte
	cd $(APP) && npm run test

gates: ## Schnelle Gates: Lint, Typen, Architekturgrenzen, Format
	cd $(APP) && npm run gates

ci: ## Alle Gates in der Reihenfolge der CI, bricht beim ersten Fehler ab
	cd $(APP) && npm run ci

clean: ## Build-Ausgaben und node_modules entfernen
	cd $(APP) && rm -rf node_modules packages/*/node_modules packages/*/dist

deploy: ## Staging aus origin/main bauen und starten (auf dem Host, braucht app/deploy/.env)
	$(APP)/deploy/scripts/deploy.sh

backup: ## Datenbank sichern (app/deploy/backups)
	$(APP)/deploy/scripts/backup.sh

restore-test: ## Wiederherstellungstest in Wegwerf-Container (braucht Docker)
	$(APP)/deploy/scripts/restore-test.sh
