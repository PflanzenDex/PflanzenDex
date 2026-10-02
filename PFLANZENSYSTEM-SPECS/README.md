# Pflanzensystem – Userstories & Anforderungen

Stand: 2026-10-02 · Ableitung aus dem **Ist-Zustand** des Vaults (Dashboard, Notizen, Skripte, Hook, Tests, vorhandene Design-Specs). Kein Neuentwurf: beschrieben wird, was das System heute tut, was geplant ist und wo Ist und Doku auseinanderlaufen.

## Dateien

| Datei | Inhalt |
|---|---|
| [00-Systemueberblick.md](00-Systemueberblick.md) | Ziel, Akteure, Architektur, Komponenten, Datenmodell, Glossar |
| [01-Bestand-Arten-und-Exemplare.md](01-Bestand-Arten-und-Exemplare.md) | Epic BES: Art-Notizen, Exemplare, Anlegen, Steckling, Archiv |
| [02-Licht-und-Lampen.md](02-Licht-und-Lampen.md) | Epic LIC: Lampenstufen, Zuordnung, Verteilung, Position |
| [03-Pflegephasen.md](03-Pflegephasen.md) | Epic PHA: Ruhe-/Wachstumsphase, Standort-Abgleich |
| [04-Wachstum-und-Fotos.md](04-Wachstum-und-Fotos.md) | Epic WAC: Messung, Trend, Vergeilung, Foto-Bewertung |
| [05-Behandlungen.md](05-Behandlungen.md) | Epic BEH: Schädlinge, Krankheiten, Kuren |
| [06-Wunschliste.md](06-Wunschliste.md) | Epic WUN: Kaufkandidaten, Puffer-Check, Recherche |
| [07-Pokedex.md](07-Pokedex.md) | Epic POK: Sammelkarten, Taxonomie-Baum, Meilensteine |
| [08-Monitoring-Sensorik.md](08-Monitoring-Sensorik.md) | Epic MON: Bot-Erinnerungen, Gießen, Sensoren (**geplant**) |
| [09-Querschnitt-Qualitaet.md](09-Querschnitt-Qualitaet.md) | Epic QS: nicht-funktionale Anforderungen, Prinzipien-Check |
| [11-Soziales.md](11-Soziales.md) | Epic SOZ: Freunde, Feed „Neu bei Freunden", Tauschen (**geplant**) |
| [10-Luecken-und-Backlog.md](10-Luecken-und-Backlog.md) | Befunde (Ist ≠ Doku, Defekte, Datenlücken) und priorisiertes Backlog |
| [12-Zielarchitektur-AI-first.md](12-Zielarchitektur-AI-first.md) | Zielarchitektur: AI-first, Tech-Stack, Hub-Vorschlag zu E-SOZ-01 (**Entwurf**) |

## Konventionen

- **Akteure:** *Pflanzenhalter* (der Nutzer), *Freund* (anderer Pflanzenhalter, nur Epic SOZ), *Claude* (Assistent in Claude Code oder Chat), *System* (Hook, Skript, Dataview-Block, Bot). Siehe `00-Systemueberblick.md`.
- **IDs:** `US-<EPIC>-nn` Userstory, `FR-<EPIC>-nn` funktionale Anforderung, `DM-nn` Datenmodell, `NFR-nn` nicht-funktional. IDs sind stabil, nicht neu nummerieren.
- **Status je Story/Anforderung:**
  - ✅ umgesetzt und im Vault vorhanden
  - 🟡 teilweise umgesetzt oder mit bekannter Abweichung
  - ⬜ geplant, nicht umgesetzt (nur Spec/Entwurf)
- **Akzeptanzkriterien** sind als Gegeben/Wenn/Dann-Kurzform geschrieben und gegen den Code geprüft, wo Status ✅ steht.
- **Quelle** nennt die Datei, aus der abgeleitet wurde. Bei Widerspruch gilt der Code, dann `CLAUDE.md`, dann die Design-Specs in `docs/superpowers/specs/`.

## Status-Übersicht

| Epic | Stories | ✅ | 🟡 | ⬜ |
|---|---|---|---|---|
| BES Bestand | 8 | 7 | 1 | 0 |
| LIC Licht | 4 | 4 | 0 | 0 |
| PHA Pflegephasen | 4 | 4 | 0 | 0 |
| WAC Wachstum/Foto | 7 | 6 | 1 | 0 |
| BEH Behandlungen | 4 | 4 | 0 | 0 |
| WUN Wunschliste | 5 | 4 | 1 | 0 |
| POK Pokédex | 13 | 12 | 1 | 0 |
| MON Monitoring | 7 | 0 | 0 | 7 |
| SOZ Soziales | 13 | 0 | 0 | 13 |
| QS Querschnitt | 6 | 4 | 2 | 0 |
| **Summe** | **71** | **45** | **6** | **20** |

## Kennzahlen des Ist-Zustands (2026-10-02)

- 13 Art-Notizen, 17 Exemplar-Notizen (davon 1 Steckling), 2 archivierte Pflanzen (`04-Archive/Pflanzen/`)
- Lampenverteilung der Arten: Lampe 2 ×8, Lampe 3 ×4, Lampe 4 ×1
- Pokédex: 215 Arten in `Arten.md`, 26 Ordnungen im Baum, 0 Auflösungsfehler (Stand Baum 2026-09-29)
- Eigene Arten im Pokédex: 11 von 13 zählen als gefangen (`Hippeastrum` und `Parodia sp.` ohne Artepitheton)
- Wunschliste: 8 offene Kandidaten (Lampe 2 ×3, Lampe 3 ×2, Lampe 4 ×3), Puffer-Check aktuell ohne Warnung
- Tests: `node --test scripts/pflanzen/pokedex-core.test.js` 66/66, `pytest scripts/pflanzen/test_build_pokedex.py` 73/73 (am 2026-10-02 gelaufen)
- Kein Test für die Dataview-Logik des Pflanzen-Dashboards (liegt inline in 8 `dataviewjs`-Blöcken)

## Wichtigste Befunde (Details in `10-Luecken-und-Backlog.md`)

1. Das Monitoring-/Erinnerungskonzept (Bot, Gießlog, Sensoren) ist nur als Spec vorhanden; im Bot und in den Notizen gibt es keinen Code und keine Felder dazu. Das Dashboard ist weiterhin ein reines Pull-System.
2. Die Wachstums-Eingabe schreibt das Datum als UTC (`toISOString`); zwischen 00:00 und 02:00 Ortszeit landet die Messung am Vortag.
3. Die Dashboard-Logik (Arttabellen, Phasen, Trend, Lampen-Zähler) ist als Kopie in mehreren Blöcken ohne Tests, anders als der Pokédex (`pokedex-core.js`) und die Finanzen (`finanz-core.js`).
4. Spec und Ist weichen ab: v2/v3-Spec beschreiben Silhouetten und Namensmaskierung für fehlende Arten, der Code und `CLAUDE.md` zeigen bewusst alles offen. Der Dashboard-Text nennt „12 Arten", es sind 13.
5. `Schwierigkeit` hat zwei Skalen: Text (`Einfach/Medium/Schwer`) in Art-Notizen und Wunschliste, Zahl 1–3 in `Arten.md`.
