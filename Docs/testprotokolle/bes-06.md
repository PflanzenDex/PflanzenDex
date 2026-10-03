# Testprotokoll: US-BES-06 Exemplare als Karten sehen (Issue #62)

**Branch:** `feat/bes-06-karten` (von `origin/dev`, nach Merge von PHA-01 und den QG-Schwellen)
**Umgebung:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 im eigenen Container (Port 54777 aus `worktree-env.mjs`), API Port 55277, Web (Vite) Port 55777, Keycloak 26.8 mit dem Realm-Import aus dem Repo in einem eigenen Wegwerf-Container auf Port 18781 (der gemeinsame Anmeldedienst auf 18081 gehört einer anderen Sitzung und wurde nicht angefasst). Der Realm ist eine Kopie mit angepasster Weiterleitungs-Adresse und zwei vorab bestätigten Testkonten (`mara-bes6`, `ben-bes6`), sie liegt außerhalb des Repos. Chromium über Playwright (Zeitzone Europe/Berlin); Datum 2026-10-03.
**Methode:** Tests zuerst (rote Läufe in `bes-06/rot-*.txt`), dann Umsetzung, `make ci`, danach Bedienung von Hand (Playwright-Skript, nicht eingecheckt) gegen den echten Keycloak. Die Beispieldaten (Zone, Standorte, Arten, Exemplare) wurden mit dem Token der Konten über die API angelegt. Screenshots Desktop 1440×900 und Mobil 375×812 in `bes-06/`, rohe Messwerte in `bes-06/beobachtung-ohne.json` und `beobachtung-demo.json`. Container und Server wurden danach entfernt.

**Wichtig:** Messungen, Fotos und Behandlungen gibt es im Produkt noch nicht (WAC, BEH). Das Skript hat sie deshalb in einem zweiten Lauf mit **Demo-Ports** (nur für diese Prüfung, nicht im Repo) eingespeist, um die Darstellung zu sehen. Der erste Lauf ohne Ports ist der echte heutige Stand.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Rote Läufe und Gates

- ✅ `rot-core.txt`: 18 von 18 neuen Kerntests rot (Skelett ohne Verhalten).
- ✅ `rot-api.txt`: 8 von 9 API-Tests rot (die Route fehlte; der Test auf 401 lief zufällig grün, weil `/exemplare/karten` schon als `/exemplare/:id` geschützt war).
- ⚠️ `rot-web.txt`: 18 von 18 rot mit Skelett für `ladeKarten` und der alten Liste.
- ✅ `make ci` Exit-Code 0 (Lint, Typen, Grenzen, Baseline, Knip, Spec-, Prinzipien- und Skill-Prüfung, Duplikate, Format, Docs, Tests mit Abdeckungsschwellen, CRAP, Build).
- ⚠️ Die Web-Abdeckung von `dev` lag unter den neuen Schwellen (`PflegephasenSeite` ohne DOM-Test). Dafür wurde ein kleiner DOM-Test ergänzt, damit dieser PR grün ist.

## 1. Kriterium: Karte mit Foto/Platzhalter, Name, Art, Lichtzone, Status, Standort, letzte Messung

**Beobachtet (Lauf ohne Ports, `02-karten-ohne-ports-*.png`):**

- ✅ Vier Exemplare als Karten. Name, „Art:“, „Lichtzone:“, „Status: Pflanze“, „Standort:“ erscheinen. Regal Süd zeigt „Lichtzone: Zone 3“.
- ✅ Standort ohne Zone („Kiste ohne Zone“) und Exemplare ohne Standort zeigen „Lichtzone: unbekannt“ bzw. „Standort: unbekannt“, nichts erfunden (P-08).
- ✅ Ohne Messung steht „noch keine Messung“, das Foto ist ein Platzhalter „Noch kein Foto“ (mit Text, nicht nur Bild).
- ✅ Leerzustand (`01-bestand-leer-*.png`): „Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog.“ mit Knopf „Art wählen“ (P-09).
- ⚠️ **Grenze:** Foto, Messung und Behandlung sind im echten Produkt leer, bis `pflege` (WAC, BEH) die Ports umsetzt.

## 2. Kriterium: Messung, Foto, offene Behandlung (mit Demo-Ports, `03-…-demo-ports-*.png`)

- ✅ „Letzte Messung: Gesund am 01.10.2026“; Foto der Messung als Bild.
- ✅ Vergeilt/dünn: „Vergeilt/dünn“ mit Warnhintergrund und dem Hinweis „kein Erfolgssignal, auch bei Wachstum“ (kein grünes Erfolgszeichen).
- ✅ Behandlung: „Neem spritzen · überfällig seit 2 Tg. · +2 weitere“ (die früheste von drei); „Mehr Licht geben · heute fällig“. Überfälliges ist fett und mit Unterstreichung hervorgehoben, nicht nur durch Farbe.
- ✅ Fälligkeitsrechnung und „+N weitere“ sind im Kern mit Tests über Monats-, Jahres- und Schaltjahrgrenzen abgedeckt; in New York dieselbe Uhrzeit ergibt „heute fällig“ statt „überfällig“ (API-Test).

## 3. Kriterium: Notiz einklappbar, Foto groß

- ✅ „Notiz der Messung“ ist ein `<details>`, zu Beginn zu; Klick öffnet sie (`04-notiz-offen-mobil.png`, `notizOffen: true`).
- ⚠️ „Klick auf das Foto öffnet es groß“ ist ein Link auf die Bild-Adresse in einem neuen Tab (`target=_blank`, `rel=noopener noreferrer`), keine Lightbox. Das Foto selbst kommt erst mit WAC (Medien-Adressen); mit dem Demo-Bild wurde der Link geprüft, nicht der Aufruf eines echten Fotos.

## 4. Kriterium: Raster

- ✅ Mobil 375 px: eine Spalte, kein waagerechtes Scrollen (`scrollBreite` = 375). Desktop 1440 px: zwei Spalten (der Inhaltsrahmen der App ist schmal; weitere Spalten entstünden bei breiterem Rahmen).
- ⚠️ Die Vorgabe „eine bis zwei Spalten auf dem Handy“ ist mit einer Spalte bei 375 px erfüllt; zwei Spalten erst ab ca. 560 px Rahmenbreite. Das ist eine Annahme (Mindestbreite 16 rem je Karte), kein gemessener Wert.

## 5. Mandantentrennung

- ✅ Kerntest und API-Test mit zwei Konten: Karten nur der eigenen Exemplare, die Ports erfahren nie fremde Kennungen.
- ✅ Von Hand: Ben sieht erst den Leerzustand, nach dem Anlegen nur „Bens Ficus“ (`05-…`, `06-…`); Maras Antwort enthält nichts von „Bens“ (`maraSiehtBens: false`), Maras Namen fehlt bei Ben.

## 6. Barrierefreiheit (grob)

- ✅ Fokus: mit Tab erreicht man den Foto-Link; Fokusring 3 px solid (`04b-fokus-foto-desktop.png`).
- ✅ Touchziele: im Skript wurden alle Knöpfe, Links, Zusammenfassungen und Felder gemessen, keines unter 44 px Höhe (`kleineZiele: []`); `summary` hat 44 px Mindesthöhe.
- ✅ axe (hell und dunkel, Seite mit Demo-Karten): keine Verstöße in den Karten. Ein erster Lauf fand die Überschriftenfolge (h1 → h3); behoben, Kartennamen sind jetzt h2.
- ⚠️ axe meldet im **hellen** Schema einen Kontrastverstoß der Fußzeile „Version …“ (4,01 : 1, Text `#727c73`); sie gehört nicht zu diesem Ticket und ist nicht geändert. Im dunklen Schema keine Verstöße (`07-dunkel-desktop.png`).
- ⏭️ Bildschirmleser nicht geprüft. Dunkles Schema nur per axe und Screenshot, nicht jede Zustandsvariante.

## Offene Punkte

- Foto, letzte Messung und Behandlung werden erst sichtbar, wenn WAC (`MessungsQuelle`) und BEH (`BehandlungsQuelle`) die Ports umsetzen.
- Lichtzone = Zone des Standorts; der Override am Exemplar (Steckling) kommt mit BES-04.
- Archivierte Exemplare werden noch nicht ausgeblendet (BES-07).
- Fußzeilen-Kontrast der App (separater Fund).
