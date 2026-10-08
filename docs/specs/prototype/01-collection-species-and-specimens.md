# 01 – Epic BES: Collection (Species & Specimens)

Goal: maintain species knowledge once, keep every pot as its own specimen, and create both so that the dashboards work without rework.

Sources: `🌿 Mein Pflanzen-Dashboard.md` (blocks "Neues Exemplar anlegen", "Arten: Pflege", "Meine Exemplare", templates), `CLAUDE.md` (plant care workflow).

## User stories

### US-BES-01 · Create a new species via prompt template · ✅
As a **plant keeper** I want to get a complete species note for a new plant species, so that care, light and success criteria are documented before I create the first specimen.

Acceptance criteria:
- Given an unknown species, when I give the species template in the dashboard (block "Neue Pflanze anlegen") with the plant name to Claude, then Claude delivers **one** Markdown note with all frontmatter fields from DM-01 and the five body sections, without text before or after.
- Then the note stands under `02-Areas/Pflanzen/Arten/<Art>.md`.
- If the genus does not belong to species already kept in the Pokédex, the species is additionally added to `Arten.md` (see US-POK-02).

### US-BES-02 · Create a specimen via form · ✅
As a **plant keeper** I want to create a specimen via a form, so that file name, marker, target location and catch date are right automatically.

Acceptance criteria:
- Given at least one species note, when I choose a species in the block "➕ Neues Exemplar anlegen", then the form shows in advance the file name that will arise.
- Given no species note, then a note appears to create a species first.
- When I click "Exemplar anlegen", then a note arises with `Art` (full-path link), `Standort_Aktuell`, `Gefangen_Am` (today's **local** date), `Wachstumslog: []`, `Behandlungen: []`.
- `Standort_Aktuell` is `Standort_Wachstumsphase` of the species, unless today falls in the dormancy phase and `Standort_Ruhephase` exists; then this value.
- If the target file name already exists, nothing is changed and a warning is shown.

### US-BES-03 · Tell several specimens of a species apart · ✅
As a **plant keeper** I want to tell several pots of the same species apart via the clothespin color, so that each specimen has its own measurement history.

Acceptance criteria (naming rule DM-03):
- 1st specimen: file `Art`, no marker.
- 2nd specimen: file `Art` stays, the new one is called `Art – Klammer` with `Kennzeichen: "Klammer"`. If only `Art – Klammer` exists, the new one gets the name `Art` without a marker.
- 3rd specimen (or as soon as one already carries a color): the form asks for the color of the new **and** of every existing specimen, renames the existing files to `Art – <color>` (Obsidian updates links) and sets `Kennzeichen: "Klammer <color>"`.
- Colors are unique per species (case-insensitive); duplicate color or empty color aborts without changing anything.
- Name conflicts are checked before the first change.

### US-BES-04 · Create a cutting and pot it · ✅
As a **plant keeper** I want to keep a cutting separate from grown plants, so that it stands under the cutting lamp and does not appear in the care phase tracker or the lamp distribution.

Acceptance criteria:
- When I tick "Steckling" in the form, then the specimen carries `Status: "Steckling"` and `Licht_Hardware` = lamp 1; `Standort_Aktuell` is `Standort_Wachstumsphase`, also in the dormancy phase.
- The care phase block (PHA) filters out `Status: "Steckling"`.
- The lamp distribution does not count lamp 1.
- After potting, the keeper removes `Status` and `Licht_Hardware` in the specimen; from then on the lamp of the species applies (manual step).
- The species note keeps the target profile (target lamp, `Licht_Lux_Bedarf`).

### US-BES-05 · Compare species by difficulty · ✅
As a **plant keeper** I want a table with one row per species, so that I can look up care rules without opening every note.

Acceptance criteria:
- Block "🌿 Arten: Pflege (nach Schwierigkeit)" shows columns species (link), botanical, light/lamp, watering rule (knife), substrate, pruning, success criteria, level.
- Only species with at least one specimen in `Meine Pflanzen/` appear.
- Sorted ascending by `Schwierigkeit` (text; the order `Einfach` < `Medium` < `Schwer` happens to be alphabetical).

### US-BES-06 · See specimens as cards · ✅
As a **plant keeper** I want to see every specimen as a card, so that I grasp condition and need for action at a glance.

Acceptance criteria:
- Block "🪴 Meine Exemplare": grid of cards (`minmax(230px, 1fr)`), sorted by file name.
- Each card shows: photo of the latest log entry with a photo (otherwise 🌿 placeholder), specimen name (link), species name (link, small), chips (lamp level without clamp addition, possibly `Status`), `📍 Standort_Aktuell`, `📏 last measurement · quality (date)` or "noch keine Messung".
- If the specimen has open treatments: `💊 reason · date (overdue for N days / today / in N days)`, with several "+N more".
- If the last measurement has a `Notiz`: collapsible "Letzte Bewertung".
- Clicking the photo opens the image file in a new tab.

### US-BES-07 · Archive a deceased or given-away plant · ✅
As a **plant keeper** I want to take a specimen out of the evaluations without losing its history.

Acceptance criteria:
- The **specimen** note (not the species note) is moved to `04-Archive/Pflanzen/`; `Archiviert_Am` and `Archiviert_Grund` go into the frontmatter.
- All dashboard queries are limited to `02-Areas/Pflanzen/Meine Pflanzen`, so the specimen disappears automatically from distribution, phases, growth, treatments and Pokédex ownership, without further filter logic.
- Archived specimens do not count as caught in the Pokédex.

With epic SOZ (planned) the handover of a swap archives the specimen automatically with `Archiviert_Grund: "Getauscht mit …"` (US-SOZ-11); a received specimen carries `Herkunft` (DM-S4).

Note: moving is manual; there is no button. Two archived notes exist (`Basilikum`, `Efeutute`), both still in the old format (species and specimen in one file).

### US-BES-08 · Recognize incomplete notes · 🟡
As a **plant keeper** I want to notice when a note is so incomplete that it drops out of evaluations, so that I have no silent gaps.

Acceptance criteria (target):
- A specimen note without an `Art` field, without `Standort_Aktuell` or with an unresolvable species reference is shown as a warning in the dashboard.

As-is: all blocks filter on `p.Art` and **silently** hide notes without this field. A missing `Standort_Aktuell` leads to "⚠️ steht noch: undefined" in the phase block. Only the Pokédex warns (species without epithet, species not in `Arten.md`). → Backlog B-04.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-BES-01 | Species and specimen notes are separate files; specimens carry only individual fields, species fields come via lookup (`specimen field ?? species field`). | ✅ |
| FR-BES-02 | The field `Art` is a full-path wikilink with alias; resolution happens via `metadataCache.getFirstLinkpathDest`. | ✅ |
| FR-BES-03 | The creation form applies the naming rule, checks name conflicts before the first write and renames on a change of count. | ✅ |
| FR-BES-04 | `Gefangen_Am` is filled with the local date on creation (not UTC). | ✅ |
| FR-BES-05 | The species template demands complete frontmatter (DM-01) including `Wachstumsmaß`, `Vergeilung_Anzeichen`, `Erfolgskriterien_Kurz`. The lamp assignment follows the saturation point, not survival. | ✅ |
| FR-BES-06 | A species note arises before the first specimen of the species. The form is usable only for known species. | ✅ |
| FR-BES-07 | One growth measure dimension per species is fixed; it appears as a column in the growth block. | ✅ |
| FR-BES-08 | The manual fallback (specimen template in the dashboard) produces the same schema as the form. | ✅ |
| FR-BES-09 | The block "Arten: Pflege" and the light overview are **species view** (one row per species with ≥1 specimen); phases, growth, treatments and cards are **specimen view**. | ✅ |
| FR-BES-10 | Incomplete specimen notes create a visible warning instead of silent hiding. | ⬜ (see US-BES-08) |
