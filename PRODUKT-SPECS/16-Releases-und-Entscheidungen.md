# 16 – Releases, Entscheidungen und Nicht-Ziele

Ablösung: Teil der Inhalte aus `../PFLANZENSYSTEM-SPECS/12-Zielarchitektur-AI-first.md` (Prinzipien, Tech-Entwurf, Phasen). Dort ging die Architektur davon aus, dass der **Vault Wahrheit bleibt** (ADR-01) und ein „Hub" nur Soziales hält. Das gilt nicht mehr. Der Technik-Entwurf unten ist die **überarbeitete Fassung** für die Web-App und bleibt Vorschlag, bis die Entscheidungen E-01 bis E-04 getroffen sind.

## Release-Schnitt

Grundsatz: Jedes Release ist für die drei Start-Nutzer **nutzbar**. Reihenfolge nach „Was braucht man, um den Vault ablösen zu können?", dann Social, dann Bindung.

| Release | Inhalt | Epics | Ziel |
|---|---|---|---|
| **R0 Fundament** | Konten, Einladungszugang, Standorte/Lichtzonen, Artenkatalog (Import von `Arten.md` und Art-Notizen), Exemplare, Import-Werkzeug mit Trockenlauf | ACC, BES, LIC (05), MIG | Daten der drei sind in der App, lesbar |
| **R1 Parität** | Phasen, Messen mit Foto, Trend/Vergeilung, Behandlungen, Wunschliste, Pokédex (Karten, Besitz, Rang, Meilensteine), „Heute"-Liste, PWA | PHA, WAC, BEH, WUN, POK, LIC, QS-07 | Alles, was der Vault heute kann, ist in der App; Umschalten möglich |
| **R2 Soziales** | Freunde, Freigabe, Feed „Neu bei Freunden", Sammlung vergleichen | SOZ (01–07) | Neuzugänge der Freunde sichtbar |
| **R3 Tausch und Erinnerungen** | Angebote, Tauschbörse, Übergabe, Benachrichtigungen, Gießprotokoll | SOZ (08–13), MON (01–05, 08) | Erster echter Tausch; Bindung durch Erinnerungen |
| **R4 KI-Assistent** | Pflege per Sprache, Tagesstatus, Artprofil, Foto-Bewertung, Recherche | KI | Eingabe ohne Formulare; Katalog wächst |
| **R5 Equipment** | Equipment, Lichtzonen-Bindung, Bedarf, danach Empfehlungen | EQU | Grundlage für Stufe 2 |
| **R6 Sensorik** | Sensor-Pilot, Klima, Aggregate | MON (06, 07) | später, nach Hardware-Entscheidung |

Hinweis: R4 (KI) steht bewusst **nach** R1 bis R3. Die KI erleichtert die Eingabe, ist aber nicht die Voraussetzung, den Vault abzulösen (FR-KI-05). Verschieben lässt sie sich vor R3, wenn der Aufwand klein bleibt, weil der Katalog sie früh braucht (Artprofil, US-KI-03).

## Technik-Entwurf (Vorschlag, noch nicht entschieden)

Technikneutral begründet; Konkretes steht in den Entscheidungen.

| Bereich | Vorschlag | Begründung |
|---|---|---|
| Sprache | TypeScript durchgehend | Eine Sprache für Fachlogik, API und Web. Die Prototyp-Logik (`pokedex-core.js`, `finanz-core.js`) ist bereits JavaScript und lässt sich übernehmen. |
| Struktur | Fachlogik als eigenes Paket **ohne I/O**, API, Web, später KI-Schicht; Monorepo | P-02: Ein Kern, viele Oberflächen. |
| Datenhaltung | Relationale Datenbank (z. B. PostgreSQL), Mandantentrennung durch Konto-Kennung und Zeilenebene-Regeln | P-04. Die Domäne ist relational (Exemplar → Messung, Freundschaft, Tausch). |
| Speicher-Abstraktion | Fachlogik greift über Repository-Schnittstellen zu | austauschbarer Speicher, testbar ohne Datenbank |
| Web | Mobile-first-PWA | P-11: Foto, Messen und Gießen am Handy; native App nur bei nachgewiesenem Bedarf |
| Anmeldung | etablierter Dienst, nicht selbst gebaut | NFR-10 |
| Medien | Objektspeicher; Verkleinern und EXIF/GPS-Entfernung serverseitig | übernimmt `foto_import.py` |
| KI | KI-Schicht, die ausschließlich validierende Operationen der Fachlogik aufruft; Zugriff per MCP oder direkter API | KI-R1 |
| Jobs | Warteschlange für Erinnerungen, Katalog-Aufbau, Foto-Verarbeitung | |
| Push | Web-Push; Telegram optional | ersetzt den geplanten Bot |
| Pokédex-Aufbau | Python-Skript des Prototyps weiter nutzen (73 Tests) oder nach TypeScript portieren | E-01 |
| Tests | Unit-Tests der Fachlogik, End-to-End-Tests für Kernabläufe; Akzeptanzkriterien als Tests | P-06 |

Bewusst nicht gewählt (Vorschläge der früheren Skizze, weiterhin Alternativen): PocketBase (schnellster Prototyp, skaliert schlechter), Local-first-Sync (nur falls Offline-Betrieb hartes Muss wird).

Die verbindlichen Qualitätsschranken zu diesem Entwurf (Hooks, CI, Strukturregeln, Architekturgrenzen, Datenschutz-Gates, Definition of Done) stehen in `17-Architektur-und-Quality-Gates.md`. Weitere Entscheidungen E-13 bis E-18 dort.

## Offene Entscheidungen

| ID | Frage | Vorschlag / Stand | Blockiert |
|---|---|---|---|
| E-01 | **Technik und Hosting:** Stack, Datenbank, Hosting-Anbieter (EU), Wiederverwendung der Prototyp-Skripte (Pokédex, Foto) | siehe Technik-Entwurf; Entscheidung vor R0 | R0 |
| E-02 | **Artenkatalog:** gemeinsam (Vorschlag) oder je Nutzer? Wer prüft Profile? Wie kommen persönliche Abweichungen (Soll-Standorte, Zone) ans Exemplar bzw. Pflegeprofil? | gemeinsamer Katalog mit Prüfstatus; Abweichungen am Pflegeprofil des Nutzers | R0 |
| E-03 | **Anmeldeverfahren und Dienst** (Passwort, Magic Link, Drittanbieter) | etablierter Dienst; Wahl nach Kosten und Datenschutz | R0 |
| E-04 | **KI-Anbieter, Kostenmodell, Datenschutz** (kein Training mit Nutzerdaten, Auftragsverarbeitung) | Claude API; Limits je Konto | R4 |
| E-05 | **Code-Ablage:** eigenes Repo für die App; dieses Repo bleibt Spec-Ablage | eigenes Repo | R0 |
| E-06 | **PWA oder native App** | PWA zuerst | R1 |
| E-07 | **Verkauf gegen Geld erlauben?** | nein in Stufe 1–2 (FR-SOZ-11) | Stufe 3 |
| E-08 | **Freiwilliger Beitrag oder Abo** | offen, nach Kostenmessung | Stufe 2 |
| E-09 | **Sensor-Technik** (MQTT-Broker, Zigbee oder Kabel, Pilotpflanzen) | später | R6 |
| E-10 | **Standard-Zustellkanal** für Erinnerungen (Web-Push, Telegram, E-Mail) | Web-Push + optional E-Mail | R3 |
| E-11 | **Stecklinge im Messrhythmus:** ausnehmen oder kürzerer Rhythmus (FR-WAC-08) | offen | R3 |
| E-12 | **Rechtliches:** Datenschutzerklärung, Impressum, Altersgrenze, Werbekennzeichnung, Artenschutzhinweise | vor dem ersten Externen | Stufe 2 |

## Nicht-Ziele (bewusst nicht im Produkt)

Automatische Bewässerung, Foto-basierte Höhen-/Feuchteschätzung, Bestenlisten und Rangvergleiche zwischen Freunden (Fakten ja, Wertung nein), Cultivar-Slots im Katalog, Chat zwischen Freunden, öffentliche Profile, Verkauf gegen Geld in Stufe 1–2, Versandabwicklung, Gruppen, Auswertungen über viele Nutzer ohne Mindestanzahl und angezeigte Stichprobengröße, Finanzverwaltung (bleibt im Vault).

## Risiken der Technik

| ID | Risiko | Gegenmaßnahme |
|---|---|---|
| R-01 | Aus dem Prototyp wird ein Produkt mit Betrieb, Moderation, Datenschutz. | Kleinste Releases; Betrieb einfach; Datenschutz-Konzept vor dem ersten Externen. |
| R-02 | Die KI schreibt Werte außerhalb des Schemas. | KI-R1: nur validierende Operationen. |
| R-03 | Zwei Wahrheiten (Vault und App) laufen auseinander. | Nach dem Wechsel gilt nur die App; Vault bleibt unverändert (US-MIG-03). |
| R-04 | Fachlogik wird in Oberfläche und Erinnerungsjob zweimal geschrieben (im Prototyp B-02). | P-02; Test, dass „Heute", Erinnerung und KI dieselbe `status`-Funktion nutzen. |
| R-05 | Datenschutz: Standort, Fotos und Wohnumfeld sind sensibel. | FR-SOZ-01, EXIF/GPS entfernen, Standard privat. |
| R-06 | Zu viel Umfang vor dem ersten Nutzen. | R0 und R1 sind das Minimum, um den Vault abzulösen; alles andere danach. |
