# PflanzenDex – Produktspezifikation (Web-App)

Stand: 2026-10-02 · **Entwurf.** Nichts davon ist umgesetzt. Diese Spec beschreibt die **eigene Web-App** als Produkt. Der Obsidian-Vault (`../PFLANZENSYSTEM-SPECS/`) war der **Prototyp**: Er hat gezeigt, was funktioniert, und ist hier Referenz und Datenquelle, nicht Architekturvorgabe.

## Wie sich diese Spec zum Prototyp verhält

|            | Prototyp (`Docs/PFLANZENSYSTEM-SPECS/`) | Produkt (diese Spec)                                                       |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Nutzer     | eine Person                             | viele Personen mit Konten                                                  |
| Speicher   | Markdown + Frontmatter im Vault         | serverseitige Datenhaltung, technikneutral beschrieben                     |
| Oberfläche | Dataview-Dashboard in Obsidian          | Web-App, mobile-first                                                      |
| Eingabe    | Klick-Formulare, Claude in Claude Code  | Formulare **und** der KI-Client des Halters über eine offene Schnittstelle |
| Sozial     | nicht vorhanden                         | Kernfunktion                                                               |
| Aussage    | Ist-Zustand, abgeleitet aus dem Code    | Soll-Zustand, Anforderungen an das Produkt                                 |

Was aus dem Prototyp übernommen wird: das **fachliche Verhalten** (Phasen, Wachstumstrend, Vergeilung, Lampenlogik, Pokédex, Wunschliste-Puffer). Was nicht übernommen wird: Dateinamen, Wikilinks, Frontmatter-Schlüssel, Dataview, `processFrontMatter`, `post-commit`-Hook.

## Dateien

| Datei                                                                                          | Inhalt                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [00-Produktueberblick.md](00-Produktueberblick.md)                                             | Vision, Zielgruppe, Akteure, Prinzipien, Domänenmodell, Glossar                                               |
| [01-Konten-und-Onboarding.md](01-Konten-und-Onboarding.md)                                     | Epic ACC: Konto, Anmeldung, Profil, Einladung                                                                 |
| [02-Bestand.md](02-Bestand.md)                                                                 | Epic BES: Artenkatalog, Pflegeprofil, Prüfung, Exemplare, Steckling, Archiv                                   |
| [03-Licht-und-Standorte.md](03-Licht-und-Standorte.md)                                         | Epic LIC: Lichtzonen, Standorte, Verteilung, Position                                                         |
| [04-Pflegephasen.md](04-Pflegephasen.md)                                                       | Epic PHA: Ruhe-/Wachstumsphase, Standortabgleich                                                              |
| [05-Wachstum-und-Fotos.md](05-Wachstum-und-Fotos.md)                                           | Epic WAC: Messung, Trend, Vergeilung, Fotos                                                                   |
| [06-Behandlungen.md](06-Behandlungen.md)                                                       | Epic BEH: Schädlinge, Krankheiten, Kuren                                                                      |
| [07-Wunschliste.md](07-Wunschliste.md)                                                         | Epic WUN: Kaufkandidaten, Puffer, Weg zur Pflanze                                                             |
| [08-Pokedex.md](08-Pokedex.md)                                                                 | Epic POK: Sammelkarten, Taxonomie, Meilensteine                                                               |
| [09-Erinnerungen-und-Sensorik.md](09-Erinnerungen-und-Sensorik.md)                             | Epic MON: Benachrichtigungen, Gießen, Sensoren                                                                |
| [10-Soziales.md](10-Soziales.md)                                                               | Epic SOZ: Freunde, Feed, Tauschen                                                                             |
| [11-Equipment-und-Empfehlungen.md](11-Equipment-und-Empfehlungen.md)                           | Epic EQU: Equipment, Bedarf, Affiliate                                                                        |
| [12-KI-Assistent.md](12-KI-Assistent.md)                                                       | Epic KI: KI-Zugang über offene Schnittstelle, Aufträge, Entwürfe, Pflege per Sprache, Profile, Foto-Bewertung |
| [13-Business-Case.md](13-Business-Case.md)                                                     | Stufen: für uns, trägt sich selbst, Gewinn                                                                    |
| [14-Querschnitt.md](14-Querschnitt.md)                                                         | Epic QS: Datenschutz, Sicherheit, Mobile, Qualität                                                            |
| [15-Migration-vom-Prototyp.md](15-Migration-vom-Prototyp.md)                                   | Epic MIG: **entfallen** (kein Import aus dem Vault, IDs reserviert)                                           |
| [16-Releases-und-Entscheidungen.md](16-Releases-und-Entscheidungen.md)                         | Release-Schnitt, Technik-Entwurf, offene Entscheidungen, Nicht-Ziele                                          |
| [17-Entdecken.md](17-Entdecken.md)                                                             | Epic ENT: Swipe-Vorschläge aus dem Katalog, passend zu Licht und Gedeihendem, füllen die Wunschliste          |
| [18-Architektur-und-Quality-Gates.md](18-Architektur-und-Quality-Gates.md)                     | Epic QG: Hooks, CI, Strukturregeln, Architekturgrenzen, Komplexität, Datenschutz-Gates, DoD                   |
| [19-Entwicklungsprozess-und-Automatisierung.md](19-Entwicklungsprozess-und-Automatisierung.md) | Epic DEV: Task-Runner, Hooks, Routinen, Skills, Prozess, Release, Migrationen, Betrieb                        |

## Konventionen

- **Akteure:** _Pflanzenhalter_, _Freund_, _Betreiber_, _KI-Client_, _System_. Siehe `00-Produktueberblick.md`.
- **IDs:** `US-<EPIC>-nn`, `FR-<EPIC>-nn`, `DM-<EPIC>-nn`, `NFR-nn`. Stories, die aus dem Prototyp stammen, **behalten ihre ID** (z. B. `US-PHA-01`), damit man vergleichen kann. Neue Stories bekommen die nächste freie Nummer. IDs nicht neu nummerieren.
- **Status** (Produkt): ⬜ geplant, 🟨 in Arbeit, ✅ umgesetzt. Aktuell ist alles ⬜ außer `US-ACC-01`, `US-LIC-05`, `FR-ACC-01`, `FR-ACC-03` und `FR-QG-06`, `FR-DEV-05`, `FR-BES-04` und `FR-PHA-04` (✅), `US-LIC-01`, `US-LIC-02`, `FR-LIC-02`, `FR-LIC-04`, `US-QG-03`, `US-QG-04`, `US-QG-06`, `US-QS-03`, `US-DEV-01`, `US-DEV-08`, `FR-QG-09`, `FR-QG-19`, `FR-DEV-04`, `US-BES-01`, `US-BES-02`, `US-BES-06`, `US-BES-07`, `US-PHA-01`, `US-WAC-01`, `FR-BES-01`, `FR-BES-02`, `FR-BES-03`, `FR-BES-05`, `FR-BES-11` und `NFR-08` (🟨; bei `US-BES-01` fehlen der Auftrag an den KI-Client und der Katalog-Aufbau, bei `US-LIC-01` das Katalogfeld für weichblättrige C3-Pflanzen und die Anwendung im Pflegeprofil (BES-09), bei `US-LIC-02` das eigene Zonenfeld am Exemplar (BES-04) und die Wunschliste, auf die der Hinweis bei Gleichstand nur im Text verweist (WUN), bei `US-BES-02` der Soll-Standort der Phase (PHA) und die Kennzeichen ab dem dritten Exemplar (BES-03), bei `US-BES-06` Foto, Messung und Behandlung (kommen mit WAC und BEH über Ports), bei `US-BES-07` die Archivierung beim Tausch (SOZ-11) und die Auswertungen, die es noch nicht gibt (Behandlungen, Pokédex-Besitz, Heute-Liste; sie filtern künftig mit `istAktiv`), bei `US-PHA-01` der Soll-Standort je Phase (Pflegeprofil, BES-09), bei `US-WAC-01` das Foto sowie Rate und Trend in der Ansicht (US-WAC-03), bei `NFR-08` die Zeitzone im Profil (ACC-02) und die Lint-Regel (QG-D4), bei den `FR-BES` die Prüfer-Seite; bei `US-QG-06`/`FR-DEV-04` stehen Register und Validator, Bericht-vor-blockierend, Ratchet und Nutzenprüfung fehlen; bei `US-QG-03` fehlt das Struktur-Skript nach FR-QG-04 mit Marker-Ausnahmen, bei `US-QS-03` die Hintergrundjobs und das Nachreichen gepufferter Schreibaktionen, bei `US-DEV-01` fehlen `test-e2e`, `db-seed`, `pokedex-build` und `clean-ports`, bei `US-DEV-08` Besitzer je Epic in `CODEOWNERS` und ein CI-Gate für den Anspruch, der heute nur lokal geprüft wird) sowie dem, was die Technik-Enabler (TE) bereitstellen.
- **Prototyp-Spalte** je Story: `✅` im Prototyp erprobt, `🟡` im Prototyp teilweise, `neu` nicht im Prototyp. Sie sagt, wie gut das Verhalten schon belegt ist, nicht ob die Web-App es kann.
- **Akzeptanzkriterien** in Gegeben/Wenn/Dann-Kurzform. Sie sind als Tests gedacht (NFR-QS-08).
- **Technikneutral:** Die Spec nennt Verhalten, Daten und Grenzen, keine Frameworks. Technikentscheidungen stehen in `16-Releases-und-Entscheidungen.md` (E-nn).
- **Keine erfundenen Zahlen:** Schwellen und Beträge sind Annahmen und als solche markiert.

## Status-Übersicht

| Epic                      | Stories | aus dem Prototyp erprobt | neu    |
| ------------------------- | ------- | ------------------------ | ------ |
| ACC Konten                | 5       | 0                        | 5      |
| BES Bestand               | 10      | 8                        | 2      |
| LIC Licht und Standorte   | 5       | 4                        | 1      |
| PHA Pflegephasen          | 4       | 4                        | 0      |
| WAC Wachstum/Fotos        | 6       | 6                        | 0      |
| BEH Behandlungen          | 4       | 4                        | 0      |
| WUN Wunschliste           | 5       | 5                        | 0      |
| POK Pokédex               | 10      | 10                       | 0      |
| MON Erinnerungen/Sensorik | 8       | 0                        | 8      |
| SOZ Soziales              | 13      | 0                        | 13     |
| EQU Equipment             | 12      | 0                        | 12     |
| KI Zugang                 | 10      | 3                        | 7      |
| QS Querschnitt            | 7       | 6                        | 1      |
| MIG Migration (entfallen) | 0       | 0                        | 0      |
| ENT Entdecken             | 8       | 0                        | 8      |
| QG Quality Gates          | 8       | 0                        | 8      |
| DEV Entwicklungsprozess   | 9       | 0                        | 9      |
| **Summe**                 | **124** | **50**                   | **74** |

## Ablösung bestehender Dokumente

Diese Dokumente in `Docs/PFLANZENSYSTEM-SPECS/` sind **fachlich gültig, aber technisch überholt**, soweit sie den Vault als Wahrheit annehmen. Maßgeblich ist ab jetzt diese Spec:

| Altes Dokument                   | Wird ersetzt durch                  | Was überholt ist                                                                                                 |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `11-Soziales.md`                 | `10-Soziales.md`                    | „Hub", Vault als Wahrheit (FR-SOZ-02), Frontmatter-Felder                                                        |
| `12-Business-Case.md`            | `13-Business-Case.md`               | Stufe 1 in Obsidian, Obsidian-Hürde                                                                              |
| `12-Zielarchitektur-AI-first.md` | `16-Releases-und-Entscheidungen.md` | ADR-01 (Vault bleibt Wahrheit), Markdown-Adapter, Story „Eigene Daten, ohne Plattformzwang“ (ARC-05 im Prototyp) |
| `13-Equipment-und-Affiliate.md`  | `11-Equipment-und-Empfehlungen.md`  | Equipment-Notizen im Vault, `processFrontMatter`                                                                 |

Übernommen aus der Zielarchitektur bleiben: die Leitprinzipien P-01 bis P-06 (siehe `00-Produktueberblick.md`), Mandantenfähigkeit von Anfang an, PWA als erste Oberfläche und „Specs sind ausführbar".
