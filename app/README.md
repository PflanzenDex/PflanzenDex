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
- **Grenzprüfung:** `npm run boundaries` (Skript und Tests in `scripts/`); Meldungen nennen Regel-ID, Datei und Zeile.
- **Schwellen** (Startwerte, Annahme, E-15): Dateilänge ≤ 200, Komplexität ≤ 15, in `core` ≤ 10 (`eslint.config.js`).

## Datenbank und Mandantentrennung (TE-02)

- **Test-Datenbank:** `make db-up` startet PostgreSQL 16 in Docker (Port 54329; `make test` und `make ci` tun das selbst, in der CI läuft sie als Dienst). Anderer Server: `PFLANZENDEX_TEST_DATABASE_URL`.
- **Migrationen:** SQL-Dateien in `packages/db/migrations/`, nur vorwärts, mit Prüfsumme (eine angewendete Datei darf sich nicht ändern). Anwenden: `make migrate`.
- **Neue nutzerbezogene Tabelle:** Spalte `konto_id uuid not null references konto(id) on delete cascade`, danach `select mandantenschutz('tabelle');` und ein Eintrag in `packages/db/src/fixtures.ts`. Fehlt eines davon, scheitert der generische Test (`mandant.test.ts`). Tabellen ohne Konto (z. B. Artenkatalog) brauchen einen begründeten Eintrag in `OHNE_KONTO_KENNUNG`.
- **Zugriff:** nur über `mitKonto(pool, kontoId, …)`: Transaktion, Rolle `pflanzendex_app` (ohne BYPASSRLS), Sitzungsvariable `app.konto_id` nur für diese Transaktion.

## Anmeldung (US-ACC-01, E-03)

- **Anmeldedienst lokal:** `make auth-up` startet Keycloak 26.8 (Port 18081, Realm `pflanzendex`, Import aus `app/dev/keycloak/pflanzendex-realm.json`) und einen Mail-Fänger (Mailpit, http://localhost:18025). Das Admin-Passwort erzeugt das Ziel zufällig in `app/dev/.env` (nicht im Repo). `make auth-down` entfernt beides samt Daten.
- **Ablauf:** Die Web-App leitet per OIDC-Code-Ablauf mit PKCE zu Keycloak (Anmeldung und Registrierung dort, Deutsch). Keycloak verlangt zuerst die E-Mail-Bestätigung, danach die Passwortvergabe (Richtlinie: mindestens 10 Zeichen). Passwörter liegen nie bei uns (FR-ACC-03).
- **API:** `Authorization: Bearer <Access-Token>`; geprüft werden Signatur (JWKS), Aussteller und Ziel `pflanzendex-api`. Jede Anfrage setzt das Konto über `mitKonto`. `GET /konto` liefert die eigenen Kontodaten. Umgebung: `OIDC_ISSUER`, `OIDC_AUDIENCE`, `DATABASE_URL`, `WEB_URSPRUNG`.
- **Kontoanlage:** `findeOderLegeKonto` (db) ist der eigene Weg für die erste Anmeldung: Die Regeln `anmeldung_*` an `konto` zeigen und erlauben nur die Zeile des geprüften Subjekts (`app.subjekt`). Kein BYPASSRLS.
- **Web:** `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_API_URL` überschreiben die Voreinstellungen. „Auf allen Geräten abmelden“ ruft die Account-API von Keycloak (`DELETE /account/sessions`).
- **Tests ohne Keycloak:** Token-, Middleware- und Oberflächentests laufen ohne Anmeldedienst (lokal erzeugte Schlüssel). Der Ablauf gegen Keycloak ist manuell geprüft: `Docs/testprotokolle/acc-01.md`.

## Betreiber-Rolle und Prüfstatus (TE-08)

- **Rollen:** Tabelle `konto_rolle` (`betreiber`, `pruefer`), vergeben nur per Verwaltungszugang, nie über die Anwendung (die Anwendungsrolle hat keine Rechte auf die Tabelle; sie liest nur die eigene Rolle über `rollen_des_kontos()`). Die Rolle gibt keinen Zugriff auf fremde Inhalte (P-04).
- **Prüfstatus:** Tabelle `pruefvorgang` (Ersteller = `konto_id`, Objekt als `objekt_art` + `objekt_id`, Status `vorschlag`, `ki_ungeprueft`, `kuratiert`, `geprueft`, `zurueckgewiesen`). Operationen in `core`: `katalog.vorschlagen` (jeder), `katalog.kuratieren` und `katalog.pruefen` (nur Prüfer). Ein Auslöser in der Datenbank erzwingt dieselben Rechte zusätzlich.
- **Einzige Ausnahme vom Mandantenschutz:** Prüfer lesen die Prüfliste (`pruefvorgang`, nur Metadaten). Der Mandantentest beweist, dass ein Betreiber in allen anderen Tabellen nichts Fremdes sieht (`pruefung.test.ts`).
- **Grenze:** Der Artenkatalog (Tabelle `art`) entsteht erst mit BES-01. Dort muss die Art-Tabelle auf `pruefvorgang` verweisen (`objekt_art = 'art'`), die Sichtbarkeit (Vorschlag nur für den Ersteller, FR-BES-11) selbst regeln und Freigabe nur bei vollständigen Pflichtfeldern zulassen (FR-BES-14); Zusammenführen und Hinweise an den Ersteller gehören zu BES-10. Eine KI-Verbindung bekommt nie eine Rolle und kann daher nicht freigeben (FR-BES-06).

## Standorte und Lichtzonen (US-LIC-05)

- **Daten:** Tabellen `lichtzone` und `standort` (Migration 0004), beide mit Mandantenschutz und Namen je Konto eindeutig (ohne Beachtung der Schreibweise). Der Standort verweist über einen zusammengesetzten Fremdschlüssel `(konto_id, lichtzone_id)` auf die Zone: Eine Zone eines anderen Kontos lässt sich nicht zuordnen, Umbenennen ändert keine Zuordnung. Ein Standort ohne Zone ist zulässig und erscheint in `GET /hinweise`.
- **Operationen (`core/operationen/licht`):** `lichtzone.anlegen|aendern|loeschen|voreinstellung`, `standort.einrichten|aendern`. Schreiben nur über `fuehreAus` mit Kopfzeile `Idempotency-Key`; der Wiederholungsschutz liegt in der Tabelle `idempotenz` (24 Stunden, Annahme).
- **API:** `GET/POST /lichtzonen`, `PUT/DELETE /lichtzonen/:id`, `POST /lichtzonen/voreinstellung`, `GET/POST /standorte`, `PUT /standorte/:id`, `GET /hinweise`. Fehler: `{ fehler: { code, text, details?, daten? } }`.
- **Grenze (Zone löschen):** Der Port `ZonenNutzung` fragt alle Quellen, wer eine Zone belegt. Heute gibt es nur die Quelle „Standorte“; Exemplare und Arten entstehen mit BES. **BES muss je eine Quelle ergänzen** (Parameter `zusaetzlicheNutzung` von `lichtRouten`), sonst blieben sie beim Löschen unbemerkt. Der Mechanismus ist mit einer Attrappe getestet. Standorte lassen sich noch nicht löschen (kein Kriterium).
- **Hinweise:** Die zentrale Hinweis-Seite (US-BES-08) gibt es noch nicht; LIC-05 zeigt seine Hinweise auf der eigenen Seite und liefert sie über `standortHinweise`.

**Betrieb (TE-03):** Container, Compose, Sicherung und Deploy liegen unter `deploy/`; Anleitung in `Docs/betrieb/staging-deploy-und-backup.md`. Ziele: `make deploy`, `make backup`, `make restore-test`.
