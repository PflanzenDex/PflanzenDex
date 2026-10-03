# Runbook: Staging deployen, sichern, wiederherstellen

Ticket TE-03 (#40). Grundlage: E-01 (Selbstbetrieb, Docker Compose, ein Host), R-09, R-11, NFR-15, QG-S1. Alle Dateien liegen unter `app/deploy/`.

## Überblick

| Dienst  | Aufgabe                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------- |
| `proxy` | Caddy: HTTPS mit automatischem Zertifikat; `/health` und `/api/*` an die API, sonst an das Web |
| `api`   | Hono-API (Node 24, über tsx, da `core` als TypeScript-Quelle exportiert wird)                  |
| `web`   | statische PWA (Vite-Build, Caddy)                                                              |
| `db`    | PostgreSQL 16, Daten im Volume `dbdata`                                                        |

Die Datenbank ist nach außen nicht veröffentlicht. Nur der Proxy lauscht (Ports aus `HTTP_PORT`/`HTTPS_PORT`).

## Einmalige Einrichtung (Host)

1. Docker und Docker Compose installieren, Repo klonen.
2. `cp app/deploy/.env.example app/deploy/.env` und Werte setzen (Passwort lang und zufällig, `SITE_ADDRESS` = Domain). Die Datei steht in `.gitignore`; Geheimnisse gehören nie ins Repo (QG-S1).
3. Backup per Cron/Timer einplanen, z. B. täglich: `0 3 * * * cd /pfad/zum/repo && make backup`.

## Deploy aus `main`

```bash
make deploy          # holt origin/main, sichert die DB (falls sie läuft), baut, startet, wartet auf /health
```

Anderer Stand zum Test: `app/deploy/scripts/deploy.sh origin/dev`. Gebaut wird reproduzierbar: `npm ci` nach Lockfile, Basis-Images nach Hauptversion (`node:24-alpine`, `postgres:16-alpine`, `caddy:2-alpine`). Der laufende Stand steht in `GET /health` (`version` = Commit-Hash).
Rollback: `app/deploy/scripts/deploy.sh <früherer Commit>`; bei Datenproblemen Wiederherstellung (unten).

Lokal ausprobieren (ohne Domain): `.env` mit `SITE_ADDRESS=localhost`, dann `docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml up -d --build` und `curl -k https://localhost:8443/health`.

## Sicherung

```bash
make backup          # app/deploy/backups/pflanzendex-<UTC-Zeit>.dump (pg_dump -Fc)
```

Das Skript prüft die Datei mit `pg_restore -l`, löscht Sicherungen älter als `BACKUP_RETENTION_DAYS` und kopiert per `rsync` an `BACKUP_REMOTE`, falls gesetzt (zweiter Ort, R-11). Eine nicht lesbare Sicherung bricht mit Fehler ab (ein nicht wiederherstellbares Backup ist ein Vorfall, NFR-15).

## Wiederherstellung

```bash
# in eine zweite Datenbank (sicher, zum Prüfen):
app/deploy/scripts/restore.sh app/deploy/backups/<datei>.dump pdx_pruefung
# über die Betriebsdatenbank (überschreibt sie, API vorher stoppen):
docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml stop api
CONFIRM=ja app/deploy/scripts/restore.sh app/deploy/backups/<datei>.dump
docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml start api
```

## Wiederherstellungstest (NFR-15)

`make restore-test` startet einen Wegwerf-Postgres, legt 500 Testzeilen an, sichert mit `backup.sh`, spielt mit `restore.sh` in eine zweite Datenbank ein und vergleicht Zeilenzahl und Prüfsumme. Die Betriebsdatenbank bleibt unberührt. Monatlich auf dem Host mit einer echten Sicherung zusätzlich den Weg „zweite Datenbank“ oben durchführen und das Ergebnis protokollieren.

Testprotokoll:

| Datum      | Ort                          | Ergebnis                                                                                                             |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 2026-10-03 | Entwicklungsrechner (Docker) | `make restore-test` bestanden (500 Zeilen, gleiche Prüfsumme); Backup und Restore gegen den Compose-Stack ausgeführt |

## Offen (braucht Hardware, Domain oder Entscheidung)

Nichts davon ist erledigt oder erfunden:

- **Host:** Hardware für Staging/Produktion ist nicht benannt; Skripte und Compose sind nur lokal geprüft.
- **Domain und DNS:** Es gibt keine öffentliche Adresse. Nötig: Domain, A/AAAA-Eintrag (bei wechselnder IP Dynamic DNS) oder Tunnel, Port 80/443 am Router auf den Host. Ohne diese Schritte stellt Caddy kein öffentliches Zertifikat aus. Die Erreichbarkeit von außen per HTTPS (Kriterium aus #40) ist daher **nicht** nachgewiesen (R-11, Spike TE-15).
- **Sicherheitsupdates:** automatische Updates am Host (z. B. `unattended-upgrades`, Neustart-Regel) einrichten und hier dokumentieren.
- **Sicherung an zweiten Ort:** Ziel für `BACKUP_REMOTE` (zweiter Rechner, externer Speicher) und Verschlüsselung der Kopie festlegen. Fotos/Objektspeicher sind noch nicht gesichert, weil es sie noch nicht gibt (TE-05).
- **Monitoring und Alarme:** Überwachung von `/health` und Backup-Alter gehört zu DEV-09 (#172).
- **Image-Pins:** Basis-Images sind auf Hauptversionen fixiert, nicht auf Digests; Digest-Pinning und Image-Scan später entscheiden.
- **Migrationen:** vor produktiven Migrationen eine frische Sicherung (DEV-07, #170); `deploy.sh` sichert bereits vor jedem Deploy, solange die DB läuft.
