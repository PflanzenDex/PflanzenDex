# Test log — Wave 1: TE-04, TE-02, TE-03 (against `dev`)

**PRs:** [#185](https://github.com/PflanzenDex/PflanzenDex/pull/185) (TE-04, `feat/te-04-operationen`), [#186](https://github.com/PflanzenDex/PflanzenDex/pull/186) (TE-02, `feat/te-02-db-mandanten`), [#187](https://github.com/PflanzenDex/PflanzenDex/pull/187) (TE-03, `feat/te-03-deploy`), all targeting `dev`
**Tested on:** local integration state `docs/testprotokoll-wave1` = `origin/dev` @ `eb03231` + the three PR branches (merge order #185, #186, #187), state `f55b1d7`. Merged only locally, nothing pushed to the PR branches.
**Environment:** WSL2/Linux, Node 24, Docker Compose, date 2026-10-03; stack from #187 with `SITE_ADDRESS=localhost`, `HTTPS_PORT=8443`, throwaway password in an uncommitted `.env`
**Method:** merge the three branches, `make ci`, targeted test runs (tenant test, operations), `make restore-test`, build and start the Compose stack, Playwright screenshots (desktop 1440×900, mobile 375×812). Screenshots in `wave1/`. The code blocks are verbatim outputs of the time (German names) and unchanged.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Merging the three branches

**Expected:** the three PRs can be combined on `dev` without conflict.

**Observed:**

- ✅ #185 (TE-04) merged without conflict.
- ✅ #186 (TE-02) merged without conflict (after #185).
- ⚠️ #187 (TE-03) **conflict in two files** (after #185 and #186):
  - `Makefile`: both sides change the `.PHONY` line (#186: `db-up db-down migrate`, #187: `deploy backup restore-test`).
  - `app/README.md`: #186 appends the section "Datenbank und Mandantentrennung (TE-02)", #187 the paragraph "Betrieb (TE-03)", both at the same place at the end of the file.
  - Both conflicts are purely additive. For the test they were resolved by **uniting both sides** (`.PHONY` with all six targets; both text blocks one below the other). The conflict is not resolved silently: the PR merged last has to resolve it itself before the merge (rebase onto `dev` after the other one is merged).

## 1. Gates: `make ci` (all three PRs together)

**Expected:** lint, type check, architecture boundaries, format, tests and build run green.

**Observed:**

- ✅ `make ci` exit code 0 (test database present, `make ci` uses it).

```text
> eslint .                                   (ohne Meldung)
> tsc --noEmit -p .                          (je Paket, ohne Meldung)
Architekturgrenzen und Struktur: keine Verstöße.
All matched files use Prettier code style!
api   Tests  3 passed (3)
core  Tests 26 passed (26)
db    Tests 13 passed (13)
web   Tests  1 passed (1)
scripts: ℹ tests 12, pass 12, fail 0
vite v8.3.2 building client environment for production...
✓ 27 modules transformed. ✓ built in 137ms
```

## 2. TE-04 (#185): layer of validating operations

**Expected:** operations validate the input before every write (P-03), are idempotent via a key per user, deliver error codes `<domain>.<reason>` and check access centrally.

**Observed** (`vitest --reporter=verbose` in `packages/core`, 26 tests green, excerpt):

```text
✓ Operationen: Idempotenz > legt bei gültiger Eingabe genau einen Eintrag an
✓ Operationen: Idempotenz > Doppelaufruf mit gleichem Schlüssel erzeugt keinen Doppeleintrag
✓ Operationen: Idempotenz > gleicher Schlüssel, andere Eingabe: idempotenz.schluessel_konf…
✓ Operationen: Idempotenz > Schlüssel ist je Nutzer getrennt (P-04)
✓ Operationen: Idempotenz > fachlicher Fehler gibt den Schlüssel frei …
✓ Operationen: Idempotenz > Ausnahme in der Operation wird zu system.unerwartet mit Ursache
✓ P-03 ungültige Eingabe schreibt nichts > lehnt null / "text" / [] / {} / {"name":""} / {"name":5} ab
✓ P-03 ungültige Eingabe schreibt nichts > ungültige Eingabe reserviert den Idempotenz-Schlüssel nicht
✓ P-03 ungültige Eingabe schreibt nichts > verwirft unbekannte Felder
✓ zentraler Zugriffscheck > ohne Anmeldung: zugriff.nicht_angemeldet, nichts geschrieben
✓ zentraler Zugriffscheck > zusätzliche Berechtigung verweigert: zugriff.verweigert
Test Files 3 passed (3)   Tests 26 passed (26)
```

- ✅ All named properties are proven by executed tests; `core` stays free of Node/foreign imports (boundary check green).
- ⚠️ The operations work against ports with an in-memory store in the test (`testhilfe.ts`). A connection to the database from #186 (idempotency key, `mitKonto`) does not exist in this wave yet and was not checked. The API (`/health`) does not use the layer yet.

## 3. TE-02 (#186): tenant foundation, RLS, two-account test harness

**Expected:** every user-related table is separated by row-level security; account A sees and changes nothing of account B; a new table without protection makes the test fail; migrations forward only with checksum.

**Observed** (`vitest --reporter=verbose` in `packages/db`, 13 tests green):

```text
✓ Mandantentrennung > Konto A liest und ändert nichts von Konto B (und umgekehrt), für jede Tabelle mit Konto-Kennung
✓ Mandantentrennung > das Schema hat keine Tabelle ohne Konto-Kennung und keine ohne erzwungene Zeilenregel
✓ … eine neue Tabelle ohne Konto-Kennung fällt auf
✓ … eine Tabelle mit Konto-Kennung, aber ohne Zeilenregel, fällt auf
✓ … eine geschützte Tabelle ohne Fixture lässt den generischen Test scheitern
✓ … ein defekter Schutz wird vom generischen Test erkannt (Regel erlaubt Fremdzugriff)
✓ Sitzungsvariable > ohne Konto in der Sitzung sieht die Anwendung nichts (sicherer Ausgang)
✓ Sitzungsvariable > die Variable gilt nur in der Transaktion und leckt nicht in die nächste (Pool-Wiederverwendung)
✓ Sitzungsvariable > lehnt eine Konto-Kennung ab, die keine UUID ist (kein Einschleusen)
✓ Sitzungsvariable > bei einem Fehler im Rumpf wird zurückgerollt
✓ Migrationswerkzeug > wendet Dateien in Namensreihenfolge einmal an und merkt sich sie
✓ Migrationswerkzeug > bricht ab, wenn eine bereits angewendete Migration nachträglich geändert wurde
✓ Migrationswerkzeug > rollt eine fehlerhafte Migration vollständig zurück und lässt nichts halb angewendet
Test Files 2 passed (2)   Tests 13 passed (13)
```

- ✅ Tenant test including the "control checks" (broken protection, missing fixture) passed against real PostgreSQL 16 (container `pflanzendex-test-db`).
- ⚠️ The tests run against an already running test database; a cold start (`make db-down`, then `make ci`) was not played through separately.

## 4. TE-03 (#187): containers, Compose, backup/restore, runbook

### 4.1 Restore test `make restore-test`

**Expected:** throwaway Postgres, back up 500 test rows, restore into a second database, row count and checksum equal; production database untouched.

```text
$ make restore-test
CREATE TABLE
INSERT 0 500
Sicherung geschrieben: /tmp/tmp.EE81uIlBGE/backups/pflanzendex-20261003T081918Z.dump
CREATE DATABASE
Wiederhergestellt aus …/pflanzendex-20261003T081918Z.dump
OK: Wiederherstellungstest bestanden (500:853278bed16baa13e8a09dc798bbb906)
```

**Observed:** ✅ exit code 0, 500 rows with equal checksum.

### 4.2 Compose stack (build and start)

**Expected:** `docker compose … up -d --build` builds `api` and `web`, starts `db`, `api`, `web`, `proxy`; `api` and `db` become "healthy"; the database is not published.

```text
NAME                  STATUS                    PORTS
pflanzendex-api-1     Up 23 seconds (healthy)   3000/tcp
pflanzendex-db-1      Up 33 seconds (healthy)   5432/tcp
pflanzendex-proxy-1   Up 22 seconds             … 0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp
pflanzendex-web-1     Up 33 seconds             80/tcp, …
```

**Observed:**

- ✅ Build and start without errors; the database is only in the Compose network (port 5432 not published to the host).
- ✅ `curl -k https://localhost:8443/health` → `HTTP/2 200`, Body `{"status":"ok","produkt":"PflanzenDex","version":"f55b1d7"}` (`version` = commit of the build, `GIT_SHA` via the `.env`).
- ⚠️ `http://localhost:8080/health` answers `308` to `https://localhost/health` **without port 8443**. Relevant only with the local non-standard port configuration, uncritical on staging with 80/443; worth mentioning in the runbook.
- ⚠️ **The database in the stack is empty** (`\dt` → "Did not find any relations"). Neither `api` nor `deploy.sh` apply the migrations from #186 (`make migrate` exists only against `DATABASE_URL`). Without consequence as long as the API does not use the DB; before the first database-dependent function the deploy needs a migration step (the runbook mentions "migrations" only as an open point).

### 4.3 /health over HTTPS (desktop 1440×900)

**Expected:** JSON with status, product name, version over HTTPS.

![/health Desktop](wave1/01-health-desktop.png)

**Observed:**

- ✅ Status 200, content as above.
- ⚠️ The certificate comes from Caddy's internal CA (`localhost`); the browser reports `ERR_CERT_AUTHORITY_INVALID`. The screenshot was taken with `ignoreHTTPSErrors`. Expected for `localhost`; a publicly trusted certificate presupposes domain and DNS (see 4.5).

### 4.4 Web app (desktop and mobile)

**Expected:** the static PWA is delivered via the proxy.

![Web Desktop](wave1/02-web-desktop.png)
![Web mobile 375×812](wave1/03-web-mobil.png)

**Observed:**

- ✅ Status 200, title "PflanzenDex", heading "PflanzenDex", no console errors and no page errors.
- ⚠️ The page is a pure scaffold (unformatted heading, otherwise empty). That is expected for TE-01/TE-03, but there is no operable interface yet; a mobile/layout judgment is not possible.

### 4.5 Not executed

- ⏭️ `make deploy` / `deploy.sh` (fetches `origin/main`; a deploy of `main` makes no sense for lack of content and would have changed the host).
- ⏭️ `make backup` against the running stack (executed only indirectly in the restore test 4.1 with the same script `backup.sh`).
- ⏭️ `BACKUP_REMOTE` (rsync to a second place): no target available.
- ⏭️ Reachability from outside with a public certificate: no domain (open according to the runbook).
- ⏭️ `restore.sh` over the production database (`CONFIRM=ja`).

## 5. Clean-up

- ✅ All Compose containers, volumes and the network (`pflanzendex_*`) started by me removed (`down -v`); the temporary `app/deploy/.env` deleted.
- The container `pflanzendex-test-db` that was already running before (test database from `make db-up`) and foreign containers were not touched.

## 6. Recommendation

| PR         | Recommendation                          | Reasoning                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #185 TE-04 | **merge**                               | Tests prove validation, idempotency, error codes and access check; no conflicts; `make ci` green. Connection to the DB follows later.                                                                                                                                                                                                  |
| #186 TE-02 | **merge**                               | Generic tenant test incl. control checks green against real PostgreSQL; migration tool behaves as specified; no conflicts.                                                                                                                                                                                                             |
| #187 TE-03 | **merge, after resolving the conflict** | Stack builds and starts, `/health` over HTTPS delivers the version, DB not published, restore test passed. Before the merge: resolve the conflict in `Makefile` and `app/README.md` with #186 (additive, see 0). Open points (migration step in the deploy, domain, `BACKUP_REMOTE`) are partly named in the runbook and do not block. |

Order: #185 and #186 first, then rebase #187 onto `dev`.
