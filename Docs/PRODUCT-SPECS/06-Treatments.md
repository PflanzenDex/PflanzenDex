# 06 – Epic BEH: Treatments (Pests, Diseases, Courses of Treatment)

Goal: treatment dates are planned, their due date becomes visible and ticking off is a tap.

Prototype reference: epic BEH. Differences: stable id instead of array index (solves B-08), the done date is stored, reminder without opening the app.

## User stories

### US-BEH-01 · Plan treatment dates · ⬜ (prototype ✅)

As a **plant keeper** I want to create dates for a treatment, also several for a repeat course.

Acceptance criteria:

- Form: specimen (also several), reason (e.g. "mealybugs"), agent (optional, later linkable to equipment, US-EQU-05), date.
- Without reason or date nothing is saved.
- "Plan course": one reason, one agent, N dates at an interval of T days (default 3 dates, 7 days) create N individual treatments.

### US-BEH-02 · See open dates by urgency · ⬜ (prototype ✅)

Acceptance criteria:

- List: plant, reason, agent or "—", due on, status.
- Sorted ascending by date.
- Status: `overdue for N day(s)` (< 0), `due today` (0), `in N days` (1–3), otherwise the date.
- Without open treatments: "No open treatments."

### US-BEH-03 · Tick off a date with a tap · ⬜ (prototype ✅)

Acceptance criteria:

- "Done" sets `Done: true` and stores `Done_At` (local date). The treatment is addressed via its id, not its position (FR-BEH-02).
- The action is idempotent; a second tap (second device) changes nothing.
- Completed entries remain as history and can be viewed per specimen.

### US-BEH-04 · See an open treatment on the specimen card · ⬜ (prototype ✅)

Acceptance criteria: see US-BES-06 (next date, overdue/today/in N days, "+N more").

## Data model

### DM-BEH-01 Treatment

`Id`, `Specimen`, `Reason` (text), `Agent` (text or reference to equipment, `null` allowed), `Date`, `Done` (bool), `Done_At?`, `Course?` (shared id of the dates of a course).

## Requirements

| ID        | Requirement                                                                                                                                              | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-BEH-01 | Format like DM-BEH-01; date local.                                                                                                                       | ⬜     |
| FR-BEH-02 | Changes address the treatment via a stable id; parallel editing (two devices) never hits a wrong entry (solves B-08).                                    | ⬜     |
| FR-BEH-03 | The done date is stored.                                                                                                                                 | ⬜     |
| FR-BEH-04 | The form lists all active specimens, also cuttings.                                                                                                      | ⬜     |
| FR-BEH-05 | Due treatments trigger a reminder (US-MON-03).                                                                                                           | ⬜     |
| FR-BEH-06 | Health details (open treatment, last treated: reason, date) flow **without agent and notes** into swap offers (US-SOZ-08).                               | ⬜     |
