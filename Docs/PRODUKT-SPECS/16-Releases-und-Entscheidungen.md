# 16 – Releases, Entscheidungen und Nicht-Ziele

Ablösung: Teil der Inhalte aus `../PFLANZENSYSTEM-SPECS/12-Zielarchitektur-AI-first.md` (Prinzipien, Tech-Entwurf, Phasen). Dort ging die Architektur davon aus, dass der **Vault Wahrheit bleibt** (ADR-01) und ein „Hub" nur Soziales hält. Das gilt nicht mehr. Der Technik-Entwurf unten ist die **überarbeitete Fassung** für die Web-App und bleibt Vorschlag, bis die Entscheidungen E-01 bis E-04 getroffen sind.

## Release-Schnitt

Grundsatz: Jedes Release ist für die drei Start-Nutzer **nutzbar**. Reihenfolge nach „Was braucht man, um den Vault ablösen zu können?", dann Social, dann Bindung.

| Release | Inhalt | Epics | Ziel |
|---|---|---|---|
| **R0 Fundament** | Konten, Einladungszugang, Standorte/Lichtzonen, Artenkatalog (Import von `Arten.md` und Art-Notizen), Exemplare, Import-Werkzeug mit Trockenlauf | ACC, BES, LIC (05), MIG | Daten der drei sind in der App, lesbar |
| **R1 Parität** | Phasen, Messen mit Foto, Trend/Vergeilung, Behandlungen, Wunschliste, Pokédex (Karten, Besitz, Rang, Meilensteine), „Heute"-Liste, PWA | PHA, WAC, BEH, WUN, POK, LIC, QS-07 | Alles, was der Vault heute kann, ist in der App; Umschalten möglich |
| **R2 Soziales** | Freunde, Freigabe, Feed „Neu bei Freunden", Sammlung vergleichen | SOZ (01–07) | Neuzugänge der Freunde sichtbar |
| **R3 Tausch und Erinnerungen** | Angebote, Tauschbörse, Übergabe, Benachrichtigungen, Gießprotokoll | SOZ (08–13), MON (01–05, 08), ENT (01–07) | Erster echter Tausch; Bindung durch Erinnerungen und Entdecken |
| **R4 KI-Zugang** | Offene Schnittstelle für KI-Clients, Verbindungen und Rechte, Aufträge aus der App, Entwürfe, Pflege per Sprache, Tagesstatus, Artprofil, Foto-Bewertung, Recherche | KI | Eingabe ohne Formulare über den eigenen KI-Client; Katalog wächst |
| **R5 Equipment** | Equipment, Lichtzonen-Bindung, Bedarf, danach Empfehlungen | EQU | Grundlage für Stufe 2 |
| **R6 Sensorik** | Sensor-Pilot, Klima, Aggregate | MON (06, 07) | später, nach Hardware-Entscheidung |

Hinweis: R4 (KI-Zugang) steht bewusst **nach** R1 bis R3. Der KI-Zugang erleichtert die Eingabe, ist aber nicht die Voraussetzung, den Vault abzulösen (FR-KI-05). Weil er nur die Operationen der Fachlogik freigibt und kein KI-Produkt betreibt, ist der **Kern** (US-KI-07 Verbinden, US-KI-06 Limits, US-KI-10 Protokoll, US-KI-01/-02) klein und lässt sich ab R1 vorziehen, sobald die Operationen stabil sind. Aufträge und Entwürfe (US-KI-08/-09, US-KI-03) bleiben R4; der Katalog profitiert früh davon.

Hinweis: ENT (Entdecken) braucht nur R1 (Katalog, Pokédex, Wunschliste, Messungen) und keine Freunde; es kann auch direkt nach R1 kommen. Die Art-Merkmale (DM-ENT-01) wachsen mit dem Katalog, KI-gestützt ab R4 (US-ENT-08). Ohne Merkmale funktionieren die Anteile Platz, Pokédex, Nähe und Vorlieben bereits.

## Technik-Entwurf (Vorschlag, noch nicht entschieden)

Technikneutral begründet; Konkretes steht in den Entscheidungen.

| Bereich | Vorschlag | Begründung |
|---|---|---|
| Sprache | TypeScript durchgehend | Eine Sprache für Fachlogik, API und Web. Die Prototyp-Logik (`pokedex-core.js`, `finanz-core.js`) ist bereits JavaScript und lässt sich übernehmen. |
| Struktur | Fachlogik als eigenes Paket **ohne I/O**, API, Web, später KI-Schicht; Monorepo | P-02: Ein Kern, viele Oberflächen. |
| Datenhaltung | PostgreSQL, selbst betrieben; Mandantentrennung durch Konto-Kennung und Zeilenebene-Regeln, die über eine **Sitzungsvariable je Transaktion** (Konto-Kennung) greifen, nicht über ein anbieterspezifisches Konzept. Zugriff nur über die API und die Operationen-Schicht, nie direkt aus dem Browser | P-04. Die Domäne ist relational (Exemplar → Messung, Freundschaft, Tausch). Läuft auf jedem PostgreSQL. |
| Speicher-Abstraktion | Fachlogik greift über Repository-Schnittstellen zu | austauschbarer Speicher, testbar ohne Datenbank |
| Hosting | Selbstbetrieb auf einem Server eines EU-Anbieters mit Docker (Compose), kein Kubernetes. Anbieter offen: EU-Unternehmen bevorzugt, nicht verlangt | Betrieb einfach halten (R-01); keine Fremdabos für Datenbank und Anmeldung |
| Web | Mobile-first-PWA; **Vorschlag React** (Vite, PWA) als Client der eigenen API, ohne serverseitiges Rendering (Anwendung hinter Anmeldung). Teamerfahrung: Angular und React, etwas Next. Angular wäre gleichwertig | P-11: Foto, Messen und Gießen am Handy; native App nur bei nachgewiesenem Bedarf |
| Anmeldung | Selbst gehosteter, etablierter OAuth-/OIDC-Server (Kandidaten Keycloak, Zitadel; Wahl nach Spike TE-15), zugleich Autorisierungsserver für KI-Verbindungen (E-03, FR-KI-13); nicht selbst gebaut | NFR-10 |
| Medien | Objektspeicher; Verkleinern und EXIF/GPS-Entfernung serverseitig | übernimmt `foto_import.py` |
| KI | Keine eingebaute KI. Offene Schnittstelle für KI-Clients des Halters (Vorschlag: MCP-Server) als dünner Adapter über die validierenden Operationen; Anmeldung je Nutzer mit Rechten, serverseitig erzwungene Entwürfe, Rate-Limits, Protokoll | KI-R1, KI-R7, KI-R8 |
| Jobs | Warteschlange auf PostgreSQL (kein zusätzlicher Dienst) für Erinnerungen, Katalog-Aufbau, Foto-Verarbeitung | einfacher Betrieb (R-01) |
| Push | Web-Push; Telegram optional | ersetzt den geplanten Bot |
| Pokédex-Aufbau | Python-Skript des Prototyps (73 Tests) bleibt als **isolierter Job** mit dem Vertrag AB-4 (schreibt nur den Baum-Speicher). Die Logik `pokedex-core.js` (66 Tests) geht nach `core`. Port nach TypeScript später, abgesichert durch Vergleich mit der Ausgabe des Python-Skripts (Soll-Datei) | E-01 |
| Tests | Unit-Tests der Fachlogik, End-to-End-Tests für Kernabläufe; Akzeptanzkriterien als Tests | P-06 |

Bewusst nicht gewählt (Vorschläge der früheren Skizze, weiterhin Alternativen): PocketBase (schnellster Prototyp, skaliert schlechter), Local-first-Sync (nur falls Offline-Betrieb hartes Muss wird).

Die verbindlichen Qualitätsschranken zu diesem Entwurf (Hooks, CI, Strukturregeln, Architekturgrenzen, Datenschutz-Gates, Definition of Done) stehen in `18-Architektur-und-Quality-Gates.md`. Weitere Entscheidungen E-13 bis E-18 dort.

## Offene Entscheidungen

| ID | Frage | Vorschlag / Stand | Blockiert |
|---|---|---|---|
| E-01 | **Technik und Hosting:** Stack, Datenbank, Hosting-Anbieter (EU), Wiederverwendung der Prototyp-Skripte (Pokédex, Foto) | **Teilweise entschieden (2026-10-02):** TypeScript, Monorepo mit I/O-freiem `core`, PostgreSQL mit Sitzungsvariablen-Regeln, Warteschlange auf PostgreSQL, Selbstbetrieb (Docker auf EU-Server), Pokédex-Python bleibt isolierter Job. **Vorschlag:** React (Vite, PWA). **Offen:** Hosting-Anbieter | R0 |
| E-02 | **Artenkatalog:** gemeinsam (Vorschlag) oder je Nutzer? Wer prüft Profile? Wie kommen persönliche Abweichungen (Soll-Standorte, Zone) ans Exemplar bzw. Pflegeprofil? | **Im Grundsatz entschieden (2026-10-02):** gemeinsamer Katalog in drei Schichten (Katalog, Pflegeprofil, Exemplar; FR-BES-09). Zone des Kontos wird aus Lux-Bedarf abgeleitet (FR-BES-10). Nutzer-Vorschläge sind privat bis zur Freigabe durch den Prüfer (Betreiber), Betreiber-Batches sofort sichtbar (FR-BES-11). Katalog versioniert, Wachstumsmaß nach erster Messung gesperrt. Ruhephase im Pflegeprofil überschreibbar. Import: keine Zusammenführung abweichender Texte | R0 |
| E-03 | **Anmeldeverfahren und Dienst** (Passwort, Magic Link, Drittanbieter) | Etablierter, selbst gehosteter Dienst (E-01); Wahl nach Kosten, Datenschutz und Eignung als OAuth-Autorisierungsserver für den KI-Zugang (E-04, FR-KI-13): Dynamic Client Registration oder Client-ID-Metadata-Dokumente (CIMD wünschenswert; Claude registriert sich per DCR), PKCE, Resource-Indicators, eigene Scopes mit Zustimmungsseite, Widerruf. Kandidaten Keycloak, Zitadel; Entscheidung nach Spike (TE-15) | R0 |
| E-04 | **KI-Zugang:** Protokoll der Schnittstelle, Anmeldeverfahren der Verbindung, Rechte-Modell, Rate-Limits. Kein Anbieter-Vertrag und keine KI-Auftragsverarbeitung beim Betreiber (Weg A + B, siehe `12`). | **Im Grundsatz entschieden (2026-10-02):** Rechte als Scopes `lesen`/`Entwürfe`/`schreiben`, Voreinstellung `Entwürfe`, Klassen je Operation (FR-KI-12); Autorisierungsserver ist der Anmeldedienst aus E-03; keine Freundesdaten über Verbindungen. **Vorschlag, nicht widersprochen:** MCP über Streamable HTTP als Adapter über den Operationen, keine persönlichen Zugriffstoken. **Offen:** Test an realen Clients (Claude, ChatGPT; Gemini ungeprüft) vor R4 | R4 (Auswahlkriterien für E-03 schon vor R0) |
| E-05 | **Code-Ablage:** eigenes Repo für die App oder gemeinsames Repo mit den Specs | **Entschieden (2026-10-02):** Code im selben Repo unter `/app`, **alle Dokumentation unter `/Docs`** daneben: die Specs (`Docs/PRODUKT-SPECS/`, `Docs/PFLANZENSYSTEM-SPECS/`) und die Prozess-Dokumentation (Prinzipienregister, Entscheidungen, Betrieb, Stolperfallen). Folgen: ein Pull-Request kann Spec-Status und Code gemeinsam ändern (US-DEV-05), Tickets lassen sich per PR schließen, CI und Release brauchen Pfadfilter (FR-DEV-09) | R0 |
| E-06 | **PWA oder native App** | PWA zuerst | R1 |
| E-07 | **Verkauf gegen Geld erlauben?** | nein in Stufe 1–2 (FR-SOZ-11) | Stufe 3 |
| E-08 | **Freiwilliger Beitrag oder Abo** | offen, nach Kostenmessung | Stufe 2 |
| E-09 | **Sensor-Technik** (MQTT-Broker, Zigbee oder Kabel, Pilotpflanzen) | später | R6 |
| E-10 | **Standard-Zustellkanal** für Erinnerungen (Web-Push, Telegram, E-Mail) | Web-Push + optional E-Mail | R3 |
| E-11 | **Stecklinge im Messrhythmus:** ausnehmen oder kürzerer Rhythmus (FR-WAC-08) | offen | R3 |
| E-12 | **Rechtliches:** Datenschutzerklärung, Impressum, Altersgrenze, Werbekennzeichnung, Artenschutzhinweise; Rechteeinräumung für Katalogbeiträge von Nutzern (E-02, FR-BES-14) | vor dem ersten Externen | Stufe 2 |
| E-19 | **Eingebauter Chat mit eigenem Schlüssel des Halters (Weg C):** ja/nein/wann; würde Schlüsselverwaltung, anbieterneutralen Adapter und eigene Prompts in die App holen | Zurückgestellt; nach Erfahrung mit Weg A + B entscheiden | später |

## Nicht-Ziele (bewusst nicht im Produkt)

Automatische Bewässerung, Foto-basierte Höhen-/Feuchteschätzung, Bestenlisten und Rangvergleiche zwischen Freunden (Fakten ja, Wertung nein), Cultivar-Slots im Katalog, Chat zwischen Freunden, öffentliche Profile, Verkauf gegen Geld in Stufe 1–2, Versandabwicklung, Gruppen, Auswertungen über viele Nutzer ohne Mindestanzahl und angezeigte Stichprobengröße, Finanzverwaltung (bleibt im Vault), eingebaute KI mit Betreiber-Kontingent (siehe E-19).

## Risiken der Technik

| ID | Risiko | Gegenmaßnahme |
|---|---|---|
| R-01 | Aus dem Prototyp wird ein Produkt mit Betrieb, Moderation, Datenschutz. | Kleinste Releases; Betrieb einfach; Datenschutz-Konzept vor dem ersten Externen. |
| R-02 | Die KI schreibt Werte außerhalb des Schemas. | KI-R1: nur validierende Operationen. |
| R-07 | Prompt-Injection: Texte in Daten (Notizen, Freundesdaten) steuern den Client eines Halters. | KI-R9, FR-KI-07, Rechte-Whitelist FR-KI-10, Entwurfspflicht FR-KI-08. |
| R-08 | Qualität schwankt je Client und Modell; wir kontrollieren weder Prompt noch Modell. | Vertragstests statt Prompt-Tests (FR-KI-03), Entwürfe mit Prüfung (KI-R3), Quellenpflicht. |
| R-09 | Selbstbetrieb: Updates, Backups, Sicherheit und Monitoring liegen beim Team. | Ein Host, Docker Compose, automatische Sicherheitsupdates; Backup und Wiederherstellungstest vor R1 (NFR-15, US-DEV-09); Runbooks; Spike und Betriebskosten früh messen (NFR-16). |
| R-03 | Zwei Wahrheiten (Vault und App) laufen auseinander. | Nach dem Wechsel gilt nur die App; Vault bleibt unverändert (US-MIG-03). |
| R-04 | Fachlogik wird in Oberfläche und Erinnerungsjob zweimal geschrieben (im Prototyp B-02). | P-02; Test, dass „Heute", Erinnerung und KI dieselbe `status`-Funktion nutzen. |
| R-05 | Datenschutz: Standort, Fotos und Wohnumfeld sind sensibel. | FR-SOZ-01, EXIF/GPS entfernen, Standard privat. |
| R-06 | Zu viel Umfang vor dem ersten Nutzen. | R0 und R1 sind das Minimum, um den Vault abzulösen; alles andere danach. |
