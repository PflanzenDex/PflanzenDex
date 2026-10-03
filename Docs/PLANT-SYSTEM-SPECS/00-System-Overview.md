# 00 – System Overview

## Purpose

The plant system manages the own houseplants under a multi-level lamp system and turns this into an interaction system that one likes to open: it says what to do today (change location, treatment due, next acquisition), measures success against real own data instead of invented averages, and rewards collecting in the Pokédex.

Guiding principle from `03-Resources/Processes/System-Design-Prinzipien.md`: the human delivers only what only the human can deliver (location changed, measured number, quality judgment, purchase decision); the system computes everything derivable. Input runs through click buttons and forms (`app.fileManager.processFrontMatter`), never through raw YAML editing.

## Actors

| Actor | Role |
|---|---|
| **Plant keeper** | The user. Moves plants, measures, assesses etiolation, buys, maintains `Arten.md` and `Wunschliste.md`, proofreads what Claude researches. |
| **Friend** | Another plant keeper with a confirmed friendship (epic SOZ, planned). Sees only shared specimens, can request offers. |
| **Claude** | Researches species notes from the prompt template, researches wishlist candidates, assesses photos qualitatively, curates `Arten.md`, runs scripts. Does not commit (the user does). |
| **System** | `post-commit` hook, `build_pokedex.py`, `foto_import.py`, `dataviewjs` blocks in Obsidian, in future the Telegram bot. |

## Architecture

```
                         ┌──────────────────────────────────────┐
  Plant keeper ─────────►│ 🌿 My plant dashboard (dataviewjs)   │◄── reads live
  (clicks/forms)         │  Create · Species · Specimens · Light│
                         │  Care phases · Growth · Treat-       │
                         │  ments · Acquisitions · Templates    │
                         └───────┬───────────────┬──────────────┘
                 writes via      │               │ reads
              processFrontMatter │               │
                                 ▼               ▼
 02-Areas/Pflanzen/
   Arten/<Art>.md          ← species knowledge (1× per species), frontmatter + botanical story
   Meine Pflanzen/<…>.md   ← specimen (1× per pot): species link, location, log, treatments
   Lampen-Zuordnung.md     ← lamp level reference + live distribution
   Wunschliste.md          ← purchase candidates (frontmatter array)
   Fotos/<Exemplar>/<Datum>.jpg ← written by foto_import.py
 04-Archive/Pflanzen/      ← deceased/given-away specimens

 03-Resources/Pflanzen-Pokedex/
   Arten.md                ← curated species list (manual)
   Pokedex-Baum.json       ← generated (build_pokedex.py, never manually)
   Pflanzen-Pokedex.md     ← collector card dashboard
   .pokedex-state.json     ← "newly caught" state (gitignored)

 scripts/pflanzen/
   build_pokedex.py  ← OpenTree + Wikidata + Wikipedia + GBIF → tree
   pokedex-core.js   ← pure logic (cards, milestones, search)  [66 tests]
   pokedex.css       ← appearance
   foto_import.py    ← shrink photo, remove EXIF/GPS, link
   test_build_pokedex.py                                          [73 tests]

 .git/hooks/post-commit  → build_pokedex.py, if Arten.md changed in the commit
```

Planned, not present: bot job `pflanzen_status.py`, `Sensor-Status.md`, MQTT/ESPHome path (see `08-Monitoring-and-Sensors.md`); exchange layer ("hub") for friends, feed and swapping with `soziales-core.js` (see `11-Social.md`, technology open).

## Data model

### DM-01 Species note (`02-Areas/Pflanzen/Arten/<Art>.md`)

Frontmatter (required fields of the prompt template; all 13 existing notes carry them):

| Field | Type | Meaning |
|---|---|---|
| `Lateinischer_Name` | Text | Genus + epithet, optional cultivar (`var.`, `subsp.`, `'Cultivar'`); feeds Pokédex ownership |
| `Englischer_Name`, `Familie_DE`, `Familie_LAT` | Text | Master data |
| `Schwierigkeit` | Text | `Einfach` / `Medium` / `Schwer` (easy / medium / hard) |
| `Licht_Hardware` | Text | exactly one of four lamp strings (see DM-05) |
| `Licht_Lux_Bedarf` | Number | Lux demand for maximum growth (controls the position under the lamp) |
| `Ruhephase_Von`, `Ruhephase_Bis` | `MM-DD` | may cross the new year |
| `Standort_Wachstumsphase`, `Standort_Ruhephase` | Text | Target locations, **exact text match** with `Standort_Aktuell` |
| `Wachstumsmaß` | Text | exactly one measurement dimension (height, rosette diameter, shoot length) |
| `Vergeilung_Anzeichen` | Text | species-specific symptoms of lack of light |
| `Gießen_Messer`, `Substrat_Kurz`, `Rückschnitt_Kurz`, `Wuchs_Hack_Kurz` | Text | Short care, one sentence each |
| `Erfolgskriterien_Kurz` | Text | one sentence: observable signs of optimal care |
| `created`, `last_updated` | Date | |

Body: sections `🌿 Botanische Story & Familie`, `💧 Pflege, Substrat & Gießkalender`, `✂️ Der perfekte Rückschnitt`, `💡 Pro-Tipps & Wuchs-Hacks`, `🏆 Erfolgskriterien` (callouts such as `[!abstract]`, `[!book]`, `[!todo]`, `[!sun]`, `[!drop]`, `[!scissors]`, `[!tip]`, `[!success]`).

### DM-02 Specimen note (`02-Areas/Pflanzen/Meine Pflanzen/<Name>.md`)

| Field | Required | Meaning |
|---|---|---|
| `Art` | yes | Full-path wikilink `"[[02-Areas/Pflanzen/Arten/<Art>\|<Art>]]"` (full path, because specimen and species otherwise have the same name) |
| `Kennzeichen` | with >1 specimen | Clothespin: `Klammer` or `Klammer <color>` |
| `Standort_Aktuell` | yes | Actual location, the only manually maintained location field |
| `Gefangen_Am` | no | `YYYY-MM-DD`, feeds the Pokédex catch date |
| `Status` | no | `"Steckling"` (cutting) overrides the phase logic |
| `Licht_Hardware` | no | overrides the species value (cutting → lamp 1) |
| `Wachstumslog` | yes (`[]`) | Array `{Datum, Hoehe_cm, Qualität, Notiz?, Foto?}` |
| `Behandlungen` | yes (`[]`) | Array `{Grund, Mittel, Datum, Erledigt}` |

Lookup rule: every field in the specimen takes precedence over the same-named species field (`p[k] ?? art[k]`).

### DM-03 Naming rule for specimens

1 specimen: `Art` · 2 specimens: `Art` and `Art – Klammer` · from 3: each `Art – <color>`. The separator is an en dash with spaces.

### DM-04 Wishlist (`02-Areas/Pflanzen/Wunschliste.md`)

Frontmatter array `Kandidaten` with `Name`, `Deutsch`, `Ziel_Lampe`, `Schwierigkeit` (text), `Begruendung`, `Bild`, `Bildquelle`, `Status` (`Wunschliste` / `Gekauft` / `Verworfen`).

### DM-05 Lamp levels

| Level | String in the field `Licht_Hardware` | Purpose |
|---|---|---|
| Lamp 1 | `Lampe 1 (1.500 Lux / ~36 µmol/m²/s)` | Cutting lamp, no assignment level |
| Lamp 2 | `Lampe 2 (15.000 Lux / ~300 µmol/m²/s)` | Understory, partial shade |
| Lamp 3 | `Lampe 3 (100.000 Lux / ~1600 µmol/m²/s)` | Subtropical full sun, stem succulents |
| Lamp 4 | `Lampe 4 (110.000 Lux / ~2000 µmol/m²/s)` | Desert full sun, CAM cacti |

The strings are hard-coded **identically** in dashboard, lamp assignment, wishlist and templates; changes have to happen everywhere.

### DM-06 Pokédex data

- `Arten.md`: array `Arten` with `Name` (genus + epithet), `Deutsch`, `Schwierigkeit` (1–3), `Lampe` (2–4), optional `Notiz`.
- `Pokedex-Baum.json`: `ordnungen → familien → gattungen → arten`, per genus `arten_anzahl_gattung`, per species `wiki_titel`, `kurztext`, `bild`, `bild_quelle`, `schwierigkeit`, `lampe`, `ott_id`; meta `stand`, `fehler`, `hinweis`.

### DM-07 Social extensions (planned)

Specimen fields `Teilen`, `Teilen_Fotos` (sharing setting, default private) and `Herkunft` (after a swap); hub records friendship, offer, swap process. Details in `11-Social.md` (DM-S1 to DM-S5).

## Glossary

| Term | Meaning |
|---|---|
| Species / specimen (Art / Exemplar) | Species = knowledge (1×), specimen = one pot. The Pokédex collects species, the dashboard maintains specimens. |
| Care phase | Growth phase or dormancy phase, computed from `Ruhephase_Von/Bis` and today's date. |
| Cutting (Steckling) | Specimen with `Status: "Steckling"`, not yet potted; lamp 1, excluded from the phase tracker. |
| Etiolation (Vergeilung) | Elongation caused by lack of light: length gain, but thin and pale. Does not count as success. |
| Marker (Kennzeichen) | Clothespin on the pot, separates specimens of the same species. |
| Buffer (Puffer) | Minimum number of open wishlist candidates per lamp level (2). |
| Caught (Gefangen) | Species is owned in the Pokédex: a specimen in `Meine Pflanzen/` refers to a species note with a matching `Lateinischer_Name`. |
| Friend / hub | Confirmed other keeper / exchange layer between the vaults (epic SOZ, planned). |
| Swap (Tausch) | Request → acceptance → handover confirmed by both sides; the giver archives, the recipient creates a cutting or a plant with `Herkunft`. |
| Species-poor (Artenarm) | Genus with at most 10 species according to GBIF; badge on the species card. |
