# 04 – Epic WAC: Growth, Etiolation and Photo Assessment

Goal: success is measured against the **own** history of each plant, not against invented species averages, and length gain caused by lack of light is not counted as success.

Sources: dashboard block "📈 Wachstum", `scripts/pflanzen/foto_import.py`, `CLAUDE.md` ("Wachstum/Erfolg messen"), `System-Design-Prinzipien.md` (principle 5).

## User stories

### US-WAC-01 · Record a measurement via input field · ✅
As a **plant keeper** I want to save a measured number per specimen in the dashboard table, so that the history grows without YAML editing.

Acceptance criteria:
- The block "📈 Wachstum" has a row per specimen with: plant, "Was messen?" (`Wachstumsmaß` of the species, otherwise "— (kein Wachstumsmaß definiert)"), last measurement, rate, trend, last assessment, input.
- Input: number field (step 0.5, cm), quality choice, optional note, "Speichern".
- Invalid (non-numeric) input is ignored, nothing is written.
- Saving appends `{Datum, Hoehe_cm, Qualität, Notiz?}` to `Wachstumslog` (`Notiz` only if not empty), disables the button and shows "gespeichert — aktualisiert sich gleich".
- The same dimension is always measured at the same place (species field `Wachstumsmaß`).

### US-WAC-02 · Assess etiolation while measuring · ✅
As a **plant keeper** I want to choose "healthy" or "etiolated/thin" for every measurement and be able to read up the species-specific signs, so that I do not judge from memory.

Acceptance criteria:
- Choice `Gesund` / `Vergeilt/dünn` (default `Gesund`).
- If the species has `Vergeilung_Anzeichen`, there is "❓ woran erkennen?" that expands and collapses the text; the text is additionally a tooltip on the choice field.
- If `Qualität` is missing in a legacy entry, `Gesund` applies.

### US-WAC-03 · Growth rate and trend against the own average · ✅
As a **plant keeper** I want to see whether the plant grows faster or slower than usual, so that I notice care problems early.

Acceptance criteria:
- Zero entries: "noch keine Messung". One entry: "1 Messung — noch keine Rate".
- From two entries: overall rate in cm/year = (Δ height / Δ days) × 365 between first and last entry.
- From three entries: trend = last interval rate against the mean of all previous interval rates. Relative deviation > +10 % → 📈 faster than usual; < −10 % → 📉 slower than usual; otherwise ➡️ stable. A mean of 0 is treated as "stable".
- With two entries it says "ab der 3. Messung siehst du hier einen Trend".
- Two entries on the same day or in the wrong order (Δ days ≤ 0) yield no rate.
- There is **no** comparison with a species average (principle 5).

### US-WAC-04 · Etiolation overrides the trend · ✅
As a **plant keeper** I want length gain on an etiolated plant not to appear as success.

Acceptance criteria:
- If `Qualität` of the last entry is `Vergeilt/dünn`, the trend column shows "⚠️ Wachstum vergeilt/dünn — trotz Rate KEIN Erfolgssignal, siehe 🏆 Erfolgskriterien", regardless of the rate.
- A rising trend counts as a success signal only together with `Gesund`.

### US-WAC-05 · See last assessment and photo · ✅
As a **plant keeper** I want to see the last assessment together with the photo, so that I follow the development and judgment.

Acceptance criteria:
- The column "Letzte Bewertung" shows `date: note` of the last entry or "—".
- The specimen card (BES-06) shows the photo of the latest entry that carries a `Foto`.

### US-WAC-06 · Have Claude assess a photo qualitatively and store it · ✅
As a **plant keeper** I want to have photos assessed by Claude and stored shrunk in the vault, so that measured number, judgment and picture belong together.

Acceptance criteria (assessment):
- The keeper measures themselves and supplies the number. Claude assesses the photo purely qualitatively against `Erfolgskriterien_Kurz` and `Vergeilung_Anzeichen` and writes `Qualität` and a short `Notiz` into the **same** log entry as soon as the measured number is available.
- Claude assesses only what is visible; no estimation of height, substrate moisture or roots. If the basis is missing, `Notiz` is omitted.

Acceptance criteria (import, `foto_import.py EXEMPLAR DATUM QUELLDATEI`, also several triples):
- The log entry with this date exists beforehand; otherwise abort with a message.
- Result: `02-Areas/Pflanzen/Fotos/<Exemplar>/<Datum>.jpg`, long side at most 1600 px, JPEG quality 82, EXIF rotation applied, **EXIF/GPS removed**.
- The entry gets `Foto: "<vault path>"`. If it already carries one, it stays unchanged (idempotent, the file is not rewritten).
- Invalid date, missing note or missing source file abort with a clear message; `--dry-run` shows only the target path.

### US-WAC-07 · Measurement date equals the day of the measurement · 🟡
As a **plant keeper** I want a measurement to be saved under the date on which I enter it, so that rates are right.

Acceptance criteria (target): the date is the local calendar date.

As-is: the growth block uses `new Date().toISOString().slice(0, 10)`, i.e. the **UTC** date. In summer (CEST, UTC+2) a measurement between 00:00 and 02:00 is saved with the previous day, in winter between 00:00 and 01:00. The creation form, by contrast, calculates locally and correctly. → Backlog B-01.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-WAC-01 | `Wachstumslog` is an array of `{Datum: "YYYY-MM-DD", Hoehe_cm: number, Qualität: "Gesund"\|"Vergeilt/dünn", Notiz?: text, Foto?: vault path}`. The key `Qualität` with an umlaut is part of the format. | ✅ |
| FR-WAC-02 | The rate is a comparison against the **own** history; numbers without a verifiable source are not shown. | ✅ |
| FR-WAC-03 | The trend threshold is ±10 % (hard-wired in the code). | ✅ |
| FR-WAC-04 | Entries are sorted by `Datum` before the evaluation; the input order does not matter. | ✅ |
| FR-WAC-05 | The growth block shows all specimens, **also cuttings**. | ✅ (open whether intended) |
| FR-WAC-06 | `foto_import.py` uses the growth log format via text search (`  - Datum: "<Datum>"`, 2-space indentation). A differently formatted frontmatter (e.g. rewritten by Obsidian, without quotation marks) is not found. | 🟡 (B-06) |
| FR-WAC-07 | More than one measurement on the same day is possible, but yields no rate (Δ days = 0). | ✅ |
| FR-WAC-08 | Measuring is manual work; there is no reminder if the last measurement is too old. | ⬜ (MON-04) |
