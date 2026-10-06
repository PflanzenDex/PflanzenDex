# 03 – Epic PHA: Care Phases

Goal: the system knows from the calendar which phase (growth/dormancy) every plant should be in and shows deviations from the actual location.

Sources: dashboard block "🔔 Was jetzt zu tun ist (Pflegephasen)", species fields `Ruhephase_*`/`Standort_*`, `CLAUDE.md`.

## User stories

### US-PHA-01 · See which phase every plant should be in · ✅

As a **plant keeper** I want to see the expected phase and the target location per specimen, so that I do not forget winter and summer moves.

Acceptance criteria:

- The block lists every specimen whose species (or specimen) has `Ruhephase_Von` and `Ruhephase_Bis` and that does not carry `Status: "Steckling"`.
- Phase = 🌙 dormancy phase if today's date lies in the interval `Von…Bis`, otherwise ☀️ growth phase. The interval may cross the new year (`Von > Bis`, e.g. `11-01`…`03-15`).
- Target location = `Standort_Ruhephase` or `Standort_Wachstumsphase`.
- The calculation is based on **today's date** (trigger = page view), not on a schedule.

### US-PHA-02 · See deviations first · ✅

As a **plant keeper** I want wrongly placed plants at the top, so that I act on them first.

Acceptance criteria:

- Status = `✅ <location>` if `Standort_Aktuell` corresponds **exactly** (text equality) to the target, otherwise `⚠️ steht noch: <location>`.
- Rows with ⚠️ come before rows with ✅.

### US-PHA-03 · Confirm the move with a click · ✅

As a **plant keeper** I want to click a button after physically moving the plant, so that I do not have to edit YAML.

Acceptance criteria:

- On a deviation the row shows "Jetzt umgestellt ✔".
- Clicking writes `Standort_Aktuell = target location` via `processFrontMatter` into the specimen, disables the button and shows "gespeichert — aktualisiert sich gleich".
- Afterwards the row shows ✅.

### US-PHA-04 · Foresee the next phase change · ✅

As a **plant keeper** I want to know when the next change is due, so that I plan for it.

Acceptance criteria:

- Next change = earliest date ≥ today from `Von`/`Bis` of this and the next year.
- Display "heute", "in N Tagen (DD.MM.YYYY)" for ≤ 14 days, otherwise only the date.

## Requirements

| ID        | Requirement                                                                                                                                                                                      | Status          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| FR-PHA-01 | `Ruhephase_Von/Bis` are `MM-DD` strings. A species without a real dormancy still carries values (start of the slowdown) and identical locations in both phases, then there is never a deviation. | ✅              |
| FR-PHA-02 | `Standort_Aktuell` is the only manually maintained location field (per specimen). Target locations stand only in the species note.                                                               | ✅              |
| FR-PHA-03 | The location comparison is an exact text comparison. Typos permanently produce ⚠️; the button therefore always sets the target text **copied**, not freely entered.                              | ✅              |
| FR-PHA-04 | Cuttings are excluded.                                                                                                                                                                           | ✅              |
| FR-PHA-05 | The creation form already fills `Standort_Aktuell` according to the phase (see FR-BES).                                                                                                          | ✅              |
| FR-PHA-06 | A specimen without `Standort_Aktuell` should appear as a warning of its own ("Standort fehlt"). As-is: display "steht noch: undefined".                                                          | ⬜ (B-04)       |
| FR-PHA-07 | Reminder on the day of the phase change **without** opening the dashboard (push).                                                                                                                | ⬜ (see MON-02) |
