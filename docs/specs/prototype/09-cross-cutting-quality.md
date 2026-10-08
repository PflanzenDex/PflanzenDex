# 09 – Epic QS: Cross-Cutting and Quality

Non-functional requirements that apply to all epics. The yardstick is `03-Resources/Processes/System-Design-Prinzipien.md` (checklist "Neue Systeme" and "Interaktions-Systeme") as well as `CLAUDE.md` ("Designing New Systems/Automations").

## User stories

### US-QS-01 · Nothing depends on remembering · 🟡
As a **plant keeper** I want the system to trigger need for action itself.

Acceptance criteria:
- Pokédex: ✅ the `post-commit` hook builds the tree when `Arten.md` changes.
- Care (phases, treatments, measurements, wishlist buffer): the dashboard computes **on opening**. There is no push. → epic MON.

### US-QS-02 · Logic is testable · 🟡
As a **developer (Claude/keeper)** I want to secure changes to calculations.

Acceptance criteria:
- Pokédex logic: ✅ `pokedex-core.js` (66 tests) and `build_pokedex.py` (73 tests, without network with fake clients).
- Care dashboard: ❌ the logic (phase, trend, counting, prioritization, naming rule) lies inline in `dataviewjs` blocks, with copied helper functions (`artOf`, `artPfad`, `v`) in several blocks and without tests. The model would be `finanz-core.js`. → Backlog B-02.

### US-QS-03 · Repeatable without fear · ✅
As a **plant keeper** I want to be able to run scripts as often as I like.

Acceptance criteria:
- `build_pokedex.py`: same inputs yield a byte-identical result; errors do not overwrite the good tree (atomic, exit 2).
- `foto_import.py`: already linked entries and existing files stay unchanged.
- Dashboard buttons are disabled after the click ("gespeichert — aktualisiert sich gleich") to prevent double clicks.

### US-QS-04 · Deviations become visible · ✅
As a **plant keeper** I want to notice when data and reality drift apart.

Acceptance criteria:
- Phases: ⚠️ on a wrong location. Treatments: ⚠️ overdue. Wishlist: ⚠️ buffer. Pokédex: ⚠️ see FR-POK-04.
- Trend: ⚠️ on an etiolated last measurement.
- Gaps: the Pokédex names the number of species without a Wikipedia article/GBIF count.
- Not covered: specimens without `Art`/`Standort_Aktuell` (B-04).

### US-QS-05 · Documented centrally · ✅
As **Claude** I want to be able to read the system contract at the start.

Acceptance criteria:
- `CLAUDE.md` contains "Workflow: Pflanzenpflege" and "Workflow: Pflanzen-Pokédex" (fields, naming rule, species/specimen separation, call, tests, specs).
- New systems check `System-Design-Prinzipien.md` beforehand; no new `.github/agents/*` file without trigger and data format.
- Not in `CLAUDE.md`: monitoring spec (not yet implemented; add when implementing, FR-MON-08).

### US-QS-06 · Privacy and sources · ✅
As a **plant keeper** I want to lose no location data and comply with licenses.

Acceptance criteria:
- Photos are stored with EXIF (incl. GPS) removed and reduced to a long side of 1600 px.
- Wikipedia texts/images (CC BY-SA) are shown with a source link; wishlist images carry `Bildquelle`.
- Raw sensor values do not go into the Git vault (NFR-MON-01).
- `.pokedex-state.json` is gitignored.

## Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-01 | **Data format:** the frontmatter schemas from DM-01…DM-06 are fixed and parsable. Free text carries only content, no logic. Key names (`Qualität`, `Hoehe_cm`, `Standort_Aktuell`, …) are part of the format and are not renamed. | ✅ |
| NFR-02 | **Input without YAML:** everything that only the human delivers goes through a button/form (`processFrontMatter`): location, measurement, treatment, bought, create specimen. | ✅ |
| NFR-03 | **Single source:** species knowledge stands once per species; specimens carry only deviations. | ✅ |
| NFR-04 | **Live derivation:** ownership, distribution, phases, trends are computed at every render; there is no second copy that would have to be maintained. | ✅ |
| NFR-05 | **No invented numbers:** comparisons against the own history or citable sources (GBIF, Wikipedia); unknown is shown as "unknown" (principle 5). | ✅ |
| NFR-06 | **Nothing disappears silently:** evaluations must not hide records without a note. | ❌ see B-04 |
| NFR-07 | **No interaction system without an instruction for action:** every block names what to do (⚠️/🔔/"noch N: …") instead of only showing data. | ✅ |
| NFR-08 | **Motivation mechanics need a real source:** the Pokédex draws its strength from actual ownership and real catalog gaps, not from invented comparison values or social comparison, which does not exist in the single-player vault (principle 4). | ✅ |
| NFR-09 | **Obsidian compatibility:** expanding UI inline instead of `position: fixed`; assign handlers directly instead of event delegation via `closest()`; external JS/CSS files become active on a change by reloading the note. | ✅ |
| NFR-10 | **Performance:** dashboard and Pokédex render locally without network access (data comes from `Pokedex-Baum.json` and the vault). Network access exists only in the script. | ✅ |
| NFR-11 | **Localization:** UI and data are German; date `DD.MM.YYYY` in the display, `YYYY-MM-DD` in data; keywords of the data are partly English/without umlaut (`Hoehe_cm`) and partly with umlaut (`Qualität`, `Gießen_Messer`). | ✅ (inconsistency accepted) |

## Principles check (checklist from `System-Design-Prinzipien.md`)

| Question | Pokédex | Care dashboard | Monitoring (planned) |
|---|---|---|---|
| Trigger without remembering? | ✅ Hook | 🟡 only on opening | ✅ Bot scheduler |
| Fixed, parsable format? | ✅ | ✅ | ✅ |
| Check against deviation? | ✅ | ✅ (without record gaps) | ✅ `stand`/`zuletzt` |
| Idempotent? | ✅ | ✅ | ✅ |
| Documented centrally? | ✅ | ✅ | ⬜ |
| Only prose that changes results? | ✅ | ✅ | ✅ |
| Human delivers only human things? | ✅ | ✅ | ✅ (sensor replaces button) |
| Condensation instead of raw data? | ✅ milestones, rank | ✅ trend | ✅ aggregates |
| Says what to do? | ✅ "noch N: …" | ✅ ⚠️/🔔 | ✅ Push |
| Challenges/grows with you? | ✅ rank, goals | 🟡 trend against own average | – |
