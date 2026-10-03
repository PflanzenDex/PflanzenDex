# PflanzenDex App

Monorepo (npm workspaces) mit vier Paketen. Alle Aufgaben laufen über das `Makefile` im Wurzelverzeichnis des Repos (`make help`).

| Paket           | Inhalt                                            | Regel                                                                                                                                                    |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | Fachlogik, reine Funktionen                       | importiert nichts aus API, Web, Datenbank, Dateisystem oder Netz (AB-1); jedes Verzeichnis mit Code hat einen `index.ts`                                 |
| `packages/db`   | PostgreSQL-Schema, Migrationen, Mandantentrennung | nur für `api` bestimmt; `core` und `web` importieren es nicht; jede nutzerbezogene Tabelle trägt `konto_id` und ruft `mandantenschutz()` auf (FR-ACC-02) |
| `packages/api`  | HTTP-API (Hono)                                   | ruft `core` nur über `@pflanzendex/core` (AB-2)                                                                                                          |
| `packages/web`  | Mobile-first-PWA (React, Vite)                    | ruft `core` nur über `@pflanzendex/core` (AB-2)                                                                                                          |

```bash
make setup   # Abhängigkeiten installieren
make dev     # API (Port 3000) und Web (Vite) starten
make ci      # alle Gates: Lint, Typen, Grenzen, Format, Tests, Build
```

- **Node:** Version 24 (`.nvmrc`). Vitest 5 unterstützt die ungeraden Node-Versionen (z. B. 25) nicht offiziell.
- **TypeScript 6.0.x** ist bewusst gepinnt: `typescript-eslint` unterstützt TypeScript 7 noch nicht (Peer-Bereich `<6.1`).
- **Git-Hooks** (US-DEV-02, aktiviert durch `make setup` bzw. `make hooks`): `commit-msg` prüft Conventional Commits (`commitlint.config.js`), `pre-commit` formatiert und lintet nur geänderte Dateien (`lint-staged`), `pre-push` führt `make gates` aus (gemessen: etwa 5 s). Nach Merge oder Branch-Wechsel erscheinen Hinweise auf `make setup` oder `make migrate`.
- **Grenzprüfung:** `npm run boundaries` (Skript und Tests in `scripts/`); Meldungen nennen Regel-ID, Datei und Zeile.
- **Schwellen** (Startwerte, Annahme, E-15): Dateilänge ≤ 200, Komplexität ≤ 15, in `core` ≤ 10 (`eslint.config.js`).

## Datenbank und Mandantentrennung (TE-02)

- **Test-Datenbank:** `make db-up` startet PostgreSQL 16 in Docker (Port 54329; `make test` und `make ci` tun das selbst, in der CI läuft sie als Dienst). Anderer Server: `PFLANZENDEX_TEST_DATABASE_URL`.
- **Migrationen:** SQL-Dateien in `packages/db/migrations/`, nur vorwärts, mit Prüfsumme (eine angewendete Datei darf sich nicht ändern). Anwenden: `make migrate`.
- **Neue nutzerbezogene Tabelle:** Spalte `konto_id uuid not null references konto(id) on delete cascade`, danach `select mandantenschutz('tabelle');` und ein Eintrag in `packages/db/src/fixtures.ts`. Fehlt eines davon, scheitert der generische Test (`mandant.test.ts`). Tabellen ohne Konto (z. B. Artenkatalog) brauchen einen begründeten Eintrag in `OHNE_KONTO_KENNUNG`.
- **Zugriff:** nur über `mitKonto(pool, kontoId, …)`: Transaktion, Rolle `pflanzendex_app` (ohne BYPASSRLS), Sitzungsvariable `app.konto_id` nur für diese Transaktion.

**Betrieb (TE-03):** Container, Compose, Sicherung und Deploy liegen unter `deploy/`; Anleitung in `Docs/betrieb/staging-deploy-und-backup.md`. Ziele: `make deploy`, `make backup`, `make restore-test`.
