# Testprotokoll: US-LIC-02 Wissen, wo noch Platz ist (Issue #66)

**Branch:** `feat/lic-02-wissen-wo-noch-platz` (PR #252)
**Umgebung:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in eigenem Container (Port 54808 aus `worktree-env.mjs`), API Port 55308, Web (Vite) Port 55808, eigener Keycloak 26.8 (Container `pflanzendex-kc-lic02`, Port 55408, Realm aus `app/dev/keycloak` mit zur Laufzeit angepasster Weiterleitungs-Adresse und zwei importierten Testkonten, nicht im Repo); Chromium (headless) über Playwright; Datum 2026-10-03.
**Methode:** Tests und Gates automatisch, danach Bedienung von Hand (Playwright-Skript) gegen den echten Keycloak mit den Konten `mara-lic2` und `ben-lic2`. Die Daten wurden über die API angelegt, die Ansicht wurde im Browser betrachtet. Screenshots Desktop 1440×900 und Mobil 375×812 in `lic-02/`.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Gates und Tests

- ✅ Rote Tests vor der Umsetzung: `lic-02/rot-core.txt` (12 von 12 rot), `rot-api.txt` (6 von 7 rot, der Test auf 401 lief zufällig grün, weil die Route schon als `/exemplare/:id` geschützt war), `rot-web.txt` (8 von 9 rot).
- ✅ Danach grün: core 12, API 7, Web 161 Tests (gesamt).
- ✅ `make gates` (Lint, Typen, Grenzen AB-7 bis AB-14, knip, Format, Spezifikation, Duplikate) Exit-Code 0.
- ✅ `make coverage` (Schwellen-Ratchet ok), `make crap` (max. 21,8, Grenze 450), `make duplicates` (0 Gruppen).
- ⏭️ `make ci` als Ganzes, Playwright-E2E (`make e2e`) und Lighthouse nicht lokal ausgeführt; das übernimmt die CI am PR.

## 1. Kriterium: Zählung je Zone 2 bis 4 auf Exemplar-Ebene, Exemplar vor Art, Stecklingslicht zählt nicht

**Erwartet:** je Zone 2 bis 4 die Anzahl; Zone des Exemplars vor der der Art; Stecklingslicht nicht gezählt.

**Beobachtet:**

- ✅ Mit vier Exemplaren (Fensterbank ×2, Regal, Wüstenbank): Lampe 2: 2, Lampe 3: 1, Lampe 4: 1 (`02-gleichstand-*.png`).
- ✅ Ein Exemplar am Standort „Steckling-Ecke“ (Lampe 1) wird nicht gezählt und steht unter „Nicht mitgezählt: 1 unter Stecklingslicht“ (`03-nicht-mitgezaehlt-*.png`).
- ✅ Ein archiviertes Exemplar wird nicht gezählt und genannt („1 archiviert“).
- ✅ Ein Exemplar ohne Standort wird über den Lux-Bedarf der Art (15.000 Lux, Stufe 2) Lampe 2 zugerechnet; die Karte zeigt dafür „Lichtzone: unbekannt“. Das ist beabsichtigt (Zone der Art als Rückfall), kann aber irritieren.
- ✅ Tests: core (Zählung, Exemplar vor Art, Rückfall auf Art, Steckling, archiviert, Zone unbekannt), API gegen echte Datenbank.
- ⚠️ **Annahme:** archivierte Exemplare zählen nicht (die Spec sagt dazu nichts). Der Status „steckling“ gilt als Stecklingslicht (FR-LIC-02).
- ⚠️ **Grenze:** Das Exemplar hat noch kein eigenes Zonenfeld (BES-04/BES-09). „Exemplar vor Art“ wirkt über den Standort und den Status. Das Katalogfeld für weichblättrige C3-Pflanzen fehlt, die Ableitung nimmt es nie an.

## 2. Kriterium: Die Anzeige nennt die dünnste Zone; bei Gleichstand alle mit Hinweis auf die Wunschliste

**Beobachtet:**

- ✅ Gleichstand: „Lampe 3 und Lampe 4 sind gleich dünn besetzt (je 1 Exemplar).“ mit Handlung „Setze Arten für diese Zonen auf die Wunschliste.“; beide Zeilen markiert „dünnste Zone“ (`02-gleichstand-*.png`).
- ✅ Einzelne dünnste Zone: „Lampe 3 ist die dünnste Zone (1 Exemplar).“ mit „Hier ist noch Platz: …“ (`04-duennste-einzeln-*.png`).
- ✅ Ohne Zonen: „Es gibt keine Lichtzone für erwachsene Pflanzen.“ mit Handlung (P-09) (`01-ohne-zonen-*.png`).
- ⚠️ **Grenze:** Die Wunschliste (WUN) gibt es noch nicht; der Hinweis verweist nur im Text darauf, ohne Verknüpfung.

## 3. Mandant

- ✅ Konto `ben-lic2` sieht nach Maras Anlage nur den Leerzustand ohne Zonen und keine Namen oder Zahlen von Mara (`05-fremdes-konto-*.png`).
- ✅ Tests: core (zwei Konten) und API (`ein Konto sieht nur die Verteilung seiner eigenen Exemplare und Zonen`). Es gibt keine neue Tabelle, daher keine Migration und kein neuer Eintrag im Mandantentest der Tabellen.

## 4. Darstellung

- ✅ Mobil (375 px) und Desktop: kein horizontaler Scroll (Dokumentbreite gleich Fensterbreite in allen Aufnahmen); Konsole ohne Fehler und Warnungen.
- ⏭️ Dunkelmodus, Tastaturbedienung und Screenreader nicht von Hand geprüft. Der Balken ist `aria-hidden`, die Zahl steht im Text.

## Offene Punkte

- Eigenes Zonenfeld am Exemplar (BES-04/BES-09) und Verknüpfung mit der Wunschliste (WUN, FR-LIC-04).
- ADR 0003 O-4 (Ort der abgeleiteten Lichtansichten) ist offen; die Ansicht liegt vorläufig in `bestand`.
