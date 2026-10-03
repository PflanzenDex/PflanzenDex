# 04 – Epic PHA: Care Phases

Goal: the system knows from the calendar which phase every plant should be in and shows deviations from the actual location.

Prototype reference: epic PHA. Difference: locations are entities, no text comparison; calculation and reminder run in the background, not only on opening.

## User stories

### US-PHA-01 · See which phase every plant should be in · 🟨 (prototype ✅)

As a **plant keeper** I want to see the expected phase and the target location per specimen, so that I do not forget winter and summer moves.

Acceptance criteria:

- Every active specimen (not cutting, not archived) whose species (or specimen) has a dormancy period is listed.
- Phase = dormancy phase if today's date **in the user's time zone** lies in the interval `From…Until`, otherwise growth phase. The interval may cross the new year (e.g. 11-01 to 03-15).
- Target location = the location assigned to the specimen (or the species) for this phase.

State of implementation: list, dormancy period of the species, the user's time zone (from the device for now, until the profile has one, US-ACC-02) and the turn of the year are implemented. Missing are the target location per phase (care profile of the keeper, US-BES-09: until then "unknown", never invented, P-08) and a dormancy period on the specimen itself (only the one of the species counts). The flow with a specimen in the browser test (E2E) is missing until the species catalog can be filled (US-BES-01); the API test against the database covers the phase derivation.

### US-PHA-02 · See deviations first · ⬜ (prototype ✅)

As a **plant keeper** I want wrongly placed plants at the top.

Acceptance criteria:

- Deviation = location of the specimen ≠ target location (comparison of the location id, not of the text).
- Rows with a deviation come before rows without. A specimen without a location is its own warning "Location missing" (US-BES-08), no placeholder text.

### US-PHA-03 · Confirm the move with a tap · ⬜ (prototype ✅)

As a **plant keeper** I want to tap once after physically moving the plant.

Acceptance criteria:

- "Moved now" sets the specimen's location to the target location (selected, never typed freely) and updates the row immediately.
- The action is idempotent; a double tap creates no duplicate entry (US-QS-03).
- Several specimens with the same target location can be confirmed in one step (new compared to the prototype).

### US-PHA-04 · Foresee the next phase change · ⬜ (prototype ✅)

Acceptance criteria:

- Next change = earliest date ≥ today from `From`/`Until` of this and the next year.
- Display "today", "in N days (DD.MM.YYYY)" for ≤ 14 days, otherwise only the date.

## Requirements

| ID        | Requirement                                                                                                                                                                                          | Status                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| FR-PHA-01 | `Dormancy_From/Until` are month-day values. Species without a real dormancy still carry values (start of the slowdown) and the same locations in both phases, then there is never a deviation.    | ⬜                                                                                          |
| FR-PHA-02 | The specimen carries exactly one manually maintained location field (actual). Target locations per phase belong to the care profile of the keeper's species.                                         | ⬜                                                                                          |
| FR-PHA-03 | Location comparison via id. Typos are no longer possible because only selection is allowed (solves the prototype risk from FR-PHA-03).                                                              | ⬜                                                                                          |
| FR-PHA-04 | Cuttings are excluded.                                                                                                                                                                               | ✅                                                                                          |
| FR-PHA-05 | Creating fills the location according to the phase (US-BES-02).                                                                                                                                      | ⬜ (port `TargetLocationSource` in `collection` exists, the implementation by `care` is missing) |
| FR-PHA-06 | On the day of the phase change the system reminds if specimens still stand at the old location (US-MON-02). The calculation is the same as in this epic (FR-MON-03).                                 | ⬜                                                                                          |
