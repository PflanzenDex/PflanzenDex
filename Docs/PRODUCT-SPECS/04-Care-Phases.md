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

State of implementation: list, dormancy period of the species, the user's time zone (the one of the profile, US-ACC-02; the device's zone only as fallback while none is chosen) and the turn of the year are implemented. The target location per phase comes from the keeper's care profile (US-BES-09; without an entry "unbekannt", never invented, P-08) and the dormancy period of the care profile replaces the one of the species. Missing is a dormancy period on the specimen itself. The flow with a specimen in the browser test (E2E) is missing until the species catalog can be filled (US-BES-01); the API test against the database covers the phase derivation.

### US-PHA-02 · See deviations first · ✅ (prototype ✅)

As a **plant keeper** I want wrongly placed plants at the top.

Acceptance criteria:

- Deviation = location of the specimen ≠ target location (comparison of the location id, not of the text).
- Rows with a deviation come before rows without. A specimen without a location is its own warning "Location missing" (US-BES-08), no placeholder text.

State of implementation: the list (`GET /care-phases`) comes sorted in three groups: first the deviations (location id and target location id both known and different, FR-PHA-03), then specimens without a location, then the rest (at the target, or the target is unknown, which is never a deviation, P-08); inside a group by name. The page "Pflegephasen" names the groups ("Weichen vom Soll ab", "Standort fehlt", "Stimmen überein oder Soll unbekannt"), shows "Standort fehlt" instead of a placeholder, says what to do next in every group (P-09) and states when there is no deviation. Specimens without a location rank between deviation and rest because they need action too; this is an interpretation of the criterion (the spec only demands that deviations come first). The central deviation view (US-QS-04) is not part of this story.

### US-PHA-03 · Confirm the move with a tap · 🟨 (prototype ✅)

As a **plant keeper** I want to tap once after physically moving the plant.

Acceptance criteria:

- "Moved now" sets the specimen's location to the target location (selected, never typed freely) and updates the row immediately.
- The action is idempotent; a double tap creates no duplicate entry (US-QS-03).
- Several specimens with the same target location can be confirmed in one step (new compared to the prototype).

State of implementation: the operation `care.confirm_switch` (`POST /care-phases/confirm`, `Idempotency-Key`, P-03) takes a list of specimen IDs and the profile's time zone (US-ACC-02; the device's zone only as fallback) and sets each specimen's location to the target location of its phase **today** (local calendar date, NFR-08). The target is never taken from the request: it comes from the port `PhaseLocationSource` (the keeper's choice per species and phase), the same source and the same derivation as the list (US-PHA-01), so list and confirmation cannot disagree. All or nothing in one transaction: a foreign or unknown specimen (`specimen.not_found`), an archived one (`specimen.archived`), a cutting or a species without dormancy period (`care.no_phase`, FR-PHA-04) or an unknown target (`care.target_unknown`, never invented, P-08) stops the whole step and names the specimen; a location of another account is refused by the composite foreign key. A specimen already at the target stays as it is and reports `changed: false`; the same key replays the stored answer, so a double tap writes once (US-QS-03). There is no move history to duplicate; the location is the only stored fact. The page "Pflegephasen" shows "Jetzt umgestellt" per row with a deviation, one button "Alle N nach (Standort) umstellen" per target with two or more such rows, blocks the buttons while the request runs, reloads the list afterwards (row and BES-08 hints follow) and keeps a refusal visible (P-10). **The plain location change** the BES-08 hint needs is `specimen.set_location` (`POST /specimens/:id/location`): the location is chosen from the account's own locations in the tab "Hinweise", also for cuttings (BES-04 rules stay: a cutting stays a cutting under cutting light). The port `PhaseLocationSource` is implemented by the care profile (US-BES-09), so the button appears as soon as the keeper has chosen a target location for the phase; without one the API still answers `care.target_unknown`. **Open:** moving a specimen to a location of the keeper's own choice outside a hint (editing, BES-03) has no screen yet.

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
| FR-PHA-05 | Creating fills the location according to the phase (US-BES-02).                                                                                                                                      | ⬜ (`care` implements `TargetLocationSource` from the care profile, US-BES-09; flow checked in the test log bes-09) |
| FR-PHA-06 | On the day of the phase change the system reminds if specimens still stand at the old location (US-MON-02). The calculation is the same as in this epic (FR-MON-03).                                 | ⬜                                                                                          |
