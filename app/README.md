# PflanzenDex App

Monorepo (npm workspaces) mit drei Paketen. Alle Aufgaben laufen über das `Makefile` im Wurzelverzeichnis des Repos (`make help`).

| Paket           | Inhalt                         | Regel                                                                                                                    |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/core` | Fachlogik, reine Funktionen    | importiert nichts aus API, Web, Datenbank, Dateisystem oder Netz (AB-1); jedes Verzeichnis mit Code hat einen `index.ts` |
| `packages/api`  | HTTP-API (Hono)                | ruft `core` nur über `@pflanzendex/core` (AB-2)                                                                          |
| `packages/web`  | Mobile-first-PWA (React, Vite) | ruft `core` nur über `@pflanzendex/core` (AB-2)                                                                          |

```bash
make setup   # Abhängigkeiten installieren
make dev     # API (Port 3000) und Web (Vite) starten
make ci      # alle Gates: Lint, Typen, Grenzen, Format, Tests, Build
```

- **Node:** Version 24 (`.nvmrc`). Vitest 5 unterstützt die ungeraden Node-Versionen (z. B. 25) nicht offiziell.
- **TypeScript 6.0.x** ist bewusst gepinnt: `typescript-eslint` unterstützt TypeScript 7 noch nicht (Peer-Bereich `<6.1`).
- **Grenzprüfung:** `npm run boundaries` (Skript und Tests in `scripts/`); Meldungen nennen Regel-ID, Datei und Zeile.
- **Schwellen** (Startwerte, Annahme, E-15): Dateilänge ≤ 200, Komplexität ≤ 15, in `core` ≤ 10 (`eslint.config.js`).

**Betrieb (TE-03):** Container, Compose, Sicherung und Deploy liegen unter `deploy/`; Anleitung in `Docs/betrieb/staging-deploy-und-backup.md`. Ziele: `make deploy`, `make backup`, `make restore-test`.
