# Testprotokoll: US-LIC-05 Standorte und Lichtzonen verwalten (Issue #69)

**Branch:** `feat/lic-05-standorte` (gestapelt auf `feat/acc-01-anmeldung` #192, mit `feat/te-08-betreiber` #191 hineingemergt)
**Umgebung:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in eigenem Container (Port 54431 aus `worktree-env.mjs`), API Port 54931, Web (Vite) Port 55431, Keycloak 26.8 (`make auth-up`, für den Test wurde die Weiterleitungs-Adresse des Web-Clients zur Laufzeit per Admin-API um Port 55431 ergänzt, nicht im Repo); Browser Chromium über Playwright; Datum 2026-10-03.
**Methode:** `make ci`, danach Bedienung von Hand (Playwright-Skript) gegen den echten Keycloak mit Testkonto `mara@example.test`. Screenshots Desktop 1440×900 und Mobil 375×812 in `lic-05/`.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Gates

**Erwartet:** `make ci` grün.

**Beobachtet:**

- ✅ `npm run ci` Exit-Code 0 (Lint, Typen, Grenzen, Spec-Prüfung, Format, Tests, Build) mit eigener Test-Datenbank.
- ✅ Der generische Mandantentest deckt `lichtzone`, `standort` und `idempotenz` ab (Fixtures in `fixtures.ts`).

## 1. Kriterium: Standort hat Name, Lichtzone und Art; beliebig viele je Zone

**Erwartet:** Standorte anlegen mit Name, Zone, innen/außen; mehrere Standorte pro Zone; Zone eines fremden Kontos nicht zuordenbar.

**Beobachtet:**

- ✅ „Fensterbank“ (Lampe 2, innen) und „Balkon“ (ohne Zone, außen) angelegt (`03-standorte-hinweis-*.png`).
- ✅ Tests: drei Standorte in einer Zone (core, db); fremde Zone liefert `lichtzone.nicht_gefunden` bzw. 404 (API-Test, zusammengesetzter Fremdschlüssel in der Datenbank).
- ✅ Doppelter Standortname wird abgelehnt (API 409, DB-Test); in der Oberfläche nur für Zonen von Hand gesehen (`07-name-vergeben-*.png`).
- ⏭️ Fehlermeldung bei doppeltem Standortnamen in der Oberfläche: nicht von Hand ausgelöst.

## 2. Kriterium: Lichtzone hat Name, Lux-Decke, optional PPFD, Reihenfolge

**Erwartet:** Anlegen, Ändern, Umbenennen; Werte außerhalb der Grenzen abgelehnt; fehlender PPFD erscheint als „unbekannt“ (P-08).

**Beobachtet:**

- ✅ Voreinstellung übernommen: Lampe 1 bis 4 mit 1.500 / 15.000 / 100.000 / 110.000 Lux und PPFD 36 / 300 / 1.600 / 2.000 (`02-voreinstellung-*.png`); Zahlen aus der Spezifikation.
- ✅ Zone „Lampe 2“ in „Unterholz“ umbenannt (`05-umbenannt-*.png`).
- ✅ Ungültige Eingaben (leerer Name, Lux 0 oder 1,5, PPFD negativ) werden in core und API mit 400 und Feldnamen abgelehnt; die Datenbank hat zusätzlich Prüfregeln.
- ⚠️ Die Grenzen (Lux 1 bis 200.000, PPFD 1 bis 3.000, Name 60 Zeichen) sind **Annahmen** (Startwerte), nicht belegt.
- ⏭️ Die Anzeige „PPFD unbekannt“ ist nur per Komponententest belegt, nicht im Browser.

## 3. Kriterium: Zone löschen, die genutzt wird, wird abgelehnt und nennt, wer sie nutzt

**Erwartet:** Ablehnung mit Liste der Nutzer; nach Freigabe ist Löschen möglich.

**Beobachtet:**

- ✅ „Lampe 2“ löschen → Bestätigung → Meldung „Diese Lichtzone wird noch genutzt …“ mit „Standort: Fensterbank“; die Zone bleibt (`04-loeschen-abgelehnt-*.png`).
- ✅ Ungenutzte Zone „Lampe 4“ ließ sich löschen (im Browser; Folgebild nicht gespeichert).
- ✅ Mechanismus für Exemplare und Arten über den Port `ZonenNutzung` mit Attrappe getestet: alle Nutzer werden genannt, nichts wird gelöscht.
- ⚠️ **Grenze:** Exemplare und Arten gibt es noch nicht; real prüft das Löschen nur Standorte. BES muss die Quellen ergänzen (siehe `app/README.md`). Die Anzeige von „Exemplar:“ und „Art:“ in der Oberfläche ist nur per Komponententest belegt.
- ✅ Rückfall: Der Fremdschlüssel verhindert das Löschen auch bei einer neu entstandenen Nutzung (DB-Test).

## 4. Kriterium: Umbenennen verändert keine Zuordnungen

**Erwartet:** Verweis über Kennung.

**Beobachtet:**

- ✅ Nach dem Umbenennen von „Lampe 2“ in „Unterholz“ zeigt „Fensterbank“ weiter „Unterholz · innen“ (`05-umbenannt-*.png`); Tests in core und db prüfen dieselbe Kennung.
- ✅ Standort umbenennen lässt Zone und Art unberührt (core-Test).

## 5. Kriterium: Standorte ohne Zone erscheinen in „Hinweise“

**Erwartet:** Hinweis mit nächster Handlung (P-09); verschwindet nach Zuordnung.

**Beobachtet:**

- ✅ „Balkon“ ohne Zone → Block „Hinweise“: „Der Standort „Balkon“ hat noch keine Lichtzone. Weise dem Standort eine Lichtzone zu.“ (`03-…`); Knopf „Lichtzone zuweisen“.
- ✅ Nach Zuordnung zu Lampe 3 verschwindet der Block (`06-zugewiesen-*.png`).
- ⚠️ Die zentrale „Hinweise“-Seite gehört zu US-BES-08 und existiert noch nicht; der Hinweis erscheint auf der Seite der Story und über `GET /hinweise`.

## 6. Mandantentrennung und Wiederholungsschutz

- ✅ API-Test: Konto B sieht Zonen/Standorte von Konto A nicht und kann sie weder ändern noch löschen (404) noch zuordnen.
- ✅ Gleicher `Idempotency-Key` legt nichts doppelt an; ohne Schlüssel 400; zwei parallele `beginne`-Aufrufe ergeben genau einen Treffer (DB-Test).
- ⏭️ Zwei Browser-Konten gleichzeitig: nicht von Hand geprüft.

## 7. Mobil (375 px) und Bedienung

- ✅ Alle Zustände mobil als Screenshot; Schaltflächen und Eingaben 48 px hoch; kein horizontales Scrollen (Dokumentbreite 360 px bei 375 px Fenster).
- ⚠️ Die Ansicht ist lang, weil jede Zone zwei Knöpfe untereinander zeigt; Verdichten wäre Folgearbeit.
- ⚠️ Im Browser traten zwei Konsolenmeldungen auf, die nicht ausgewertet wurden (vermutlich das fehlende `favicon.ico`, bekannt aus ACC-01).
- ⏭️ Keine Kontrastmessung, kein Test mit Bildschirmleser, kein Dunkelmodus-Screenshot.

## Offene Punkte

- Standorte lassen sich nicht löschen (kein Kriterium); sobald Exemplare einen Standort nutzen, braucht das Löschen denselben Nutzungsport.
- Das Verschieben der Reihenfolge geschieht über eine Zahl, nicht per Ziehen.
- Der Test lief mit angepasster Weiterleitungs-Adresse im lokalen Keycloak; das Realm-Export im Repo kennt nur Port 5173.
