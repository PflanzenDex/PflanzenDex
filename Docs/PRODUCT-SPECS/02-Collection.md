# 02 – Epic BES: Collection (Species Catalog and Specimens)

Goal: species knowledge once in the shared catalog, every pot as its own specimen, and both created in a way that all evaluations work without rework.

Prototype reference: epic BES (`../PLANT-SYSTEM-SPECS/01-Collection-Species-and-Specimens.md`). The difference: in the prototype every keeper creates their species notes themselves. In the app species come from a **shared catalog** (E-02), filled by the operator and reviewed proposals; account-specific deviations live in the **care profile** (DM-BES-04).

Note (US-QS-14): the collection of specimens is shown as the view "Pflanzen" of the destination "Sammlung", next to the species view of the Pokédex epic (POK).

Note (US-QS-14): the species comparison by difficulty (US-BES-05) is the arrangement "Schwierigkeit" of the species view "Arten" of the destination "Sammlung"; the former destination "Artenvergleich" no longer exists and its address leads there.

Note (US-QS-14): the hints about incomplete specimens (US-BES-08) are shown as the section "Fehlt noch" of the destination "Heute"; the former destination "Hinweise" no longer exists and its address leads there.

Note (US-QS-14): the own care profile (US-BES-09) is the section "Mein Pflegeprofil" of the profile of a species, not a destination of its own; the former address "Pflegeprofil" leads to the species view of the destination "Sammlung", where a species is chosen. The plants can be grouped by location and zone in the view "Pflanzen".

Note (US-QS-14): the species catalog (US-BES-01, US-BES-02, US-BES-03) is the mode "Katalog" of the destination "Entdecken" (switch "Vorschläge | Katalog"); the former destination "Arten" no longer exists and its address leads there. A species profile is a page below "Entdecken" (`/discover/species/<id>`).

## User stories

### US-BES-01 · Choose a species from the catalog or create a new one · 🟨 (prototype ✅)

As a **plant keeper** I want to find the matching species for a new specimen, so that care, light and success criteria are settled before I create the pot.

Acceptance criteria:

- Given a search by Latin or German name, when the species is in the catalog, then I see its profile (fields from DM-BES-01) and choose it.
- Given a species that is not in the catalog, when I choose "Propose species", then I can create a profile in the form with all required fields (the path without AI, FR-KI-05) or hand the research to my AI client (task, US-KI-08); its result arrives as a draft (US-KI-03, US-KI-09) that I review and confirm. The profile initially has the status `Proposal` and is **visible only to me**; I can still create a specimen. It goes into the review list (US-BES-10). Only after approval is the species available to everyone and does it count in the Pokédex (US-POK-06); until then: "Have the species reviewed, then it counts" (FR-BES-11, FR-BES-06).
- A species without epithet (genus only) is allowed as an entry, but does not count as a Pokédex catch (see US-POK-06).
- Duplicates (same normalized name or synonym) are recognized and the existing species is referenced. The search also finds synonyms (e.g. _Sansevieria_ → _Dracaena_).

### US-BES-02 · Create a specimen · 🟨 (prototype ✅)

As a **plant keeper** I want to create a specimen with few details.

Acceptance criteria:

- Required: species. Prefilled: name per naming rule (DM-BES-03), location per today's phase (see `US-PHA-01`), `Caught_At` = today's **local** date, empty measurement series and treatment list.
- Optional: a catch date, so that a plant the keeper owned long before using the app is not "caught today" (FR-BES-04). Without a value `Caught_At` is today's local date. The date is a calendar date (no time of day) and must exist in the calendar.
- Given a catch date in the future, when I save, then nothing is written, the error names the field and says that the catch date cannot lie ahead (P-09). "Future" is measured against today's date in the keeper's time zone (profile, US-ACC-02), never against the UTC date (NFR-08). Today itself is allowed.
- Given a catch date in the past, when I save, then it is stored as given and the Pokédex shows it as the catch date of the species (US-POK-07) when it is the earliest across the keeper's specimens.
- Location = target location of the growth phase, unless today falls in the dormancy phase and a dormancy location exists.
- The name is fixed before saving. If it already exists, nothing is changed and the naming rule is applied (US-BES-03).

State of implementation: creating with species, name per naming rule, local `Caught_At` or an optional back-dated catch date (field `catchDate`; a later date is refused with `specimen.caught_in_future`, an impossible one with `input.invalid` on that field; the form field is "Fangdatum", preset to today), optional marker and chosen location; measurement series and treatment list are empty, derived. The target location of the phase comes through the port `TargetLocationSource`, which `care` implements from the keeper's care profile (US-BES-09): a new specimen without a chosen location stands at the target of today. Without a profile the location is "unknown" as long as the keeper chooses none (P-08). The marker rules from the third specimen on are implemented with US-BES-03.

Correcting the catch date of an existing specimen afterwards is its own story with the same rules: US-BES-11.

### US-BES-03 · Tell several specimens of a species apart · ✅ (prototype ✅)

As a **plant keeper** I want to tell several pots of the same species apart, so that each specimen has its own history.

Acceptance criteria (naming rule DM-BES-03):

- 1st specimen: name = species, no marker.
- 2nd specimen: the new one gets a marker (default "clip", freely selectable).
- From the 3rd: every specimen has its own marker (in the prototype a color). The app asks for the missing markers before saving.
- Markers are unique per species (case-insensitive); duplicate or empty is an error without change.
- Unlike in the prototype the name is not a file: renaming changes no references.

State of implementation: complete for the criteria above. A further specimen without a marker is refused (`specimen.marker_required`); from the third **active** specimen on the request must carry the missing markers of the existing specimens, otherwise nothing is written (`specimen.markers_missing`); renaming (`specimen.mark`) gives or changes a marker and keeps the ID. Archived specimens do not count and keep name and marker (US-BES-07). The default "clip" ("Klammer") is a preset of the form, not applied by the API. **Not part of this story:** changing the location or other fields of an existing specimen (follow-up with the move, `US-PHA-03`); restoring an archived specimen can leave three active specimens with one unmarked, the rule is checked when creating and renaming.

### US-BES-04 · Create a cutting and pot it · 🟨 (prototype ✅)

As a **plant keeper** I want to keep a cutting separately, so that it stands under cutting light and does not appear in the phase tracker or the light distribution.

Acceptance criteria:

- "Cutting" sets `Status: Cutting` and the light zone cutting light (lamp 1 of the default); the location is the location of the growth phase, also in the dormancy phase.
- Phase tracker and light distribution (lamps 2–4) exclude cuttings.
- "Potted" is an action: it sets `Status: Plant`, removes the light zone override, and from then on the light zone of the species applies. A "Potted" event goes into the feed if the specimen is shared.
- The species keeps its target profile (target light zone, `Light_Lux_Demand`).

### US-BES-05 · Compare species by difficulty · ✅ (prototype ✅)

As a **plant keeper** I want a table with one row per species, so that I can look up care rules without opening each species.

Acceptance criteria:

- Columns: species, botanical name, light zone, watering rule, substrate, pruning, success criteria, difficulty.
- Only species with at least one active specimen. Sorted by `Difficulty` (number 1–3, display Easy/Medium/Hard).

State of implementation: complete for the criteria above. The tab "Artenvergleich" (`GET /specimens/difficulty`) shows one row per species with an active specimen (archived ones do not count, US-BES-07), sorted by difficulty ascending and then by botanical name. The light zone is the one derived from the lux demand (FR-LIC-01, never the zone of a location); the watering rule is the catalog's watering hint, not the keeper's own interval from the care profile (US-BES-09). Every value the catalog does not know reads "unbekannt" (P-08). Derived on every request, nothing stored (P-01).

### US-BES-06 · See specimens as cards · 🟨 (prototype ✅)

As a **plant keeper** I want to see every specimen as a card, so that I grasp condition and need for action at a glance.

Acceptance criteria:

- Card: photo of the latest measurement with a photo (otherwise placeholder), name, species, light zone, status, location, last measurement with quality and date or "no measurement yet".
- Open treatment: reason, due date (overdue for N days / today / in N days), with several "+N more".
- The note of the last measurement is collapsible. Clicking the photo opens it large.
- The grid adapts to the screen width (phone: one to two columns).

State of implementation: cards with name, species, light zone (the one of the location), status and location; "unbekannt" when something is missing (P-08). The last measurement (value in cm, quality, date) and the collapsible note come from the measurements (`care` implements the port `MeasurementSource`, US-WAC-01); without a measurement the card says "noch keine Messung". The open treatment with "overdue for N days / due today / in N days" and "+N more" comes from the planned treatments (`care` implements the port `TreatmentSource`, US-BEH-01); without an open treatment the card says "keine offene Behandlung". The photo with a link to the large view is finished and tested in core, API and UI, **but shows nothing** until `care` delivers the photo (US-WAC-05): until then the cards say "Noch kein Foto". Etiolated/thin is never shown as success. **Open:** the zone of a cutting override (BES-04). Archived specimens are hidden by BES-07.

### US-BES-07 · Archive a deceased or given-away plant · 🟨 (prototype ✅)

As a **plant keeper** I want to take a specimen out of the evaluations without losing its history.

Acceptance criteria:

- "Archive" with a reason (`died`, `given away`, `swapped`, `gifted`, `sold`, free text) sets `Status: Archived`, `Archived_At` and `Archived_Reason`.
- Archived specimens are missing from distribution, phases, growth, treatments, Pokédex ownership and today list, but remain viewable with their history and can be restored.
- On a swap the archiving happens automatically (US-SOZ-11).

State of implementation: "Archivieren" (card in the tab Bestand) with a reason from the list (`eingegangen`, `abgegeben`, `getauscht`, `verschenkt`, `verkauft`) or free text sets the status, `Archived_At` (local calendar date of the profile's time zone, NFR-08, US-ACC-02; the device's zone only as fallback) and `Archived_Reason`; a second archiving changes neither (P-10). Archived specimens are missing from the list, from the BES-06 cards (the ports for measurements and treatments do not learn their IDs), from the care phases and from measuring (measuring is rejected with `specimen.archived`); they stay viewable through `GET /specimens/:id` and the section "Archiv" (species, date, reason) and can be restored (status as before the archiving, a cutting stays a cutting). The name of an archived specimen stays taken (assumption, so that restoring never collides; a new specimen of the species then needs a marker). **Open:** the automatic archiving on a swap (SOZ-11) and the evaluations that do not exist yet (distribution, treatments, Pokédex ownership, today list); they must filter with `isActive`. The measurement series of an archived specimen is still readable through the API but not reachable in the UI.

### US-BES-08 · Recognize incomplete data · 🟨 (prototype 🟡)

As a **plant keeper** I want to notice when a specimen is so incomplete that it drops out of evaluations (P-10).

Acceptance criteria:

- A specimen without species, without location or with a location without light zone appears in "Hints" with the action that fixes it.
- No evaluation hides it silently; it is counted with a note or listed separately.

State of implementation: the tab "Hinweise" (`GET /specimens/hints`, derived live from specimens, locations and the species catalog, nothing stored, P-01) lists every **active** specimen (archived ones are no longer part of the collection, US-BES-07) of the own account (P-04) with a hint per gap: no location (`location_missing`), a location without light zone (`location_without_zone`, names the location) or a species the account cannot read (`species_missing`). Each hint carries the action that fixes it and a button to the tab where it is done (P-09); without hints the page says what it checked. Cuttings are checked like plants. **Species:** the database forbids a specimen without a species (`species_id` is `not null` with a foreign key), so the case can only occur when a species vanishes from the account's view; the hint guards it. **No silent drop-out (P-10):** the light distribution already names what it does not count (cutting light, archived, zone unknown); its note on "unknown zone" now points to "Hinweise", and a test shows that every specimen counted as "zone unknown" has a hint. The cards show "unbekannt" for missing location or zone (BES-06). **Location missing is fixable here (US-PHA-03):** the hint carries a choice among the account's own locations and the button "Standort setzen" (`specimen.set_location`, `POST /specimens/:id/location`); afterwards the hint is gone because the hints are derived (a location without light zone then shows its own hint). Without any location the hint says to create one first and links to "Standorte und Licht". **Open:** changing the location of a specimen anywhere else (editing a specimen, BES-03) has no screen yet; the central "Heute" list (TE-07) lists incomplete specimens from these same hints (`specimenHints`), the QS deviations (QS-04) do not exist yet and must count them the same way; the hint "Standort ohne Zone" of LIC-05 stays on its own page (`GET /hints`); care phases skip plants whose species has no dormancy period (FR-PHA-04, by design, not a data gap); hints for a missing lux need of a species (FR-LIC-03) and for an overridden care profile (BES-09) come with those stories.

### US-BES-09 · Adjust my own care profile per species · 🟨 new

As a **plant keeper** I want to deviate from the catalog default values where my location or climate requires it, without changing the catalog.

Acceptance criteria:

- For each species with an active specimen (or wish) the app shows the catalog value and my deviation side by side. Only overridable fields can be changed (FR-BES-09).
- The target location per phase is **selected** from my locations, never typed freely (FR-PHA-03). The light zone is derived from the lux demand (FR-BES-10) and can be overridden with one of my zones. Dormancy from/until is overridable (e.g. outdoor location). Watering intervals per phase see US-MON-05.
- "Reset to catalog" per field. Without deviation the catalog applies; an empty care profile is valid.
- The care profile is private (P-05) and never part of a sharing setting (US-SOZ-04).
- If the catalog changes a value that I have not overridden, I see a hint (FR-BES-12).

State of implementation: the tab "Pflegeprofil" lists every species with an active specimen (archived ones do not count, US-BES-07) and every species that already carries a deviation (so it can be reset, P-10), with the catalog value next to my deviation per field (`GET /care-profiles`, derived live, P-01). Table `care_profile` (migration 0014, key account × species, tenant isolation, composite foreign keys to locations and zone of the same account, plain key to the species as a registered global reference table, AB-10), operation `care_profile.update` (`PUT /care-profiles/:speciesId`, `Idempotency-Key`, P-03): only the overridable fields of FR-BES-09 (target location growth/dormancy, light zone, dormancy from/until as a pair, watering interval per phase, own hints); a catalog field in the request is refused by name, a request that changes nothing is invalid, `null` resets one field to the catalog, an empty profile is valid. Locations and zone are selected by ID from the account's own (`location.not_found`, `light_zone.not_found`), the species must be visible (`species.not_found`); the catalog is never written. The profile is private (row rule, P-05) and no sharing setting reads it. **Effective profile** (pure, `effectiveProfile`): specimen before profile before catalog, "unbekannt" stays unknown (P-08); no specimen field overrides one yet, so that layer is empty. **The profile feeds the ports:** `PhaseLocationSource` (US-PHA-03: the target in the phase list and "Jetzt umgestellt" now appear in the running app), `TargetLocationSource` (US-BES-02/04: a new specimen without a chosen location stands at the target of today, a cutting at the growth location), the dormancy override changes the phase of the list and of the confirmation, and the zone override changes where the species counts in the light distribution (US-LIC-02; cutting light is never a target); a zone that a profile points to cannot be deleted unnoticed (`light_zone.in_use` names the species, `ZoneUsage`). **Open:** the hint that the catalog changed a value I have not overridden (FR-BES-12) needs catalog versions, which do not exist yet; the wish as a trigger for a species in the view (WUN) does not exist; watering intervals are stored and shown, but nothing reads them until US-MON-05; the card (BES-06) still shows only the zone of the location; the starting value of an interval from the catalog's watering hint is shown as text only (the hint is free text, nothing is parsed or invented); the care-profile overrides (watering interval, zone) must flow into the species comparison table of US-BES-05, which currently shows the catalog's watering hint and the lux-derived zone (owner-approved note).

### US-BES-10 · Review and approve catalog proposals · 🟨 new

As an **operator (reviewer)** I want to review proposals before they apply to everyone.

Acceptance criteria:

- Review list with user proposals (AI creation marked) and operator batches; per entry required fields, sources and duplicate hint.
- Actions: **approve** (status `reviewed`), **reject** with a reason (the creator sees the reason, the proposal stays private and editable for them), **merge with an existing species** (specimens, wishes and care profiles of the creator are re-pointed to the existing species; nothing is lost silently, P-10).
- Approval only with complete required fields (FR-BES-05) and with a source for light demand and dormancy. An AI connection can never approve (FR-BES-06, FR-KI-09).
- After approval the species is available to everyone, counts for the creator in the Pokédex (US-POK-06) and triggers the taxonomy build (US-POK-03).
- The creator learns the result as a hint in the app. The operator sees the number and age of open proposals; working through them is a weekly routine (US-DEV-03).

State of implementation: the tab "Prüfliste" (only for operators and reviewers; `GET /account` tells the UI) lists open user proposals and the latest operator batches (`GET /review`, derived live): per entry the fields, the source or "unbekannt", the AI marking, the problems that block approval and a duplicate hint (existing approved species whose name contains the proposal's name or a synonym), plus the number and age of the open proposals. Actions: `catalog.review` approves (`reviewed`) or rejects with a reason (`POST /review/:id/decide`), `catalog.merge` folds the proposal into an approved species (`POST /review/:id/merge`), all with `Idempotency-Key` (P-03). Approval runs `checkApprovalReadiness` (required fields complete, a source is always required because the light demand is a required field; a dormancy period needs it too) and answers `review.approval_incomplete` naming the missing fields. The merge is atomic (one transaction, migration 0017): the case becomes `merged` with `merged_into` (the database lets only reviewers do it, only from an open case and only towards an approved species, never the proposal itself) and the creator's references are re-pointed through the port `SpeciesRepointer` (defined by `catalog`, implemented by `collection` for specimens and care profiles, composed in the API, ADR 0003). A care profile the creator already has for the target stays; the profile of the proposal is kept and reported to the reviewer, and the creator sees it under "Pflegeprofil" as read-only card "Dein zusammengeführter Vorschlag" with a notice naming the target species and the next action (take over by hand), so it never disappears silently (P-10). The merge locks the species row of the proposal first (`lock_species_for_merge`, which answers whether a row was really locked; `species` has forced row security, so the owner role has an UPDATE policy limited to reviewers, and a database test with a non-superuser owner proves the lock; the rest of the suite runs as superuser, which bypasses row security, a known test gap): a write of the creator that is still in flight (specimen, care profile) finishes before the re-point and is re-pointed too, and a write that comes later re-checks the species status after its own foreign-key lock and is refused as `species.not_found`. A marker clash on the target aborts the merge with `review.merge_conflict`, nothing is changed in either case. A merged proposal is invisible for everybody. Reviewers read the content of foreign open proposals only (not rejected ones, which stay private to the creator) through the review path (row rule `reviewer_reads`, limited to open cases; the species search still shows them approved species and their own proposals). The creator sees the rejection reason and an approval hint in the species view (`speciesHints`). Only operators and reviewers can decide; an AI connection has no role and so can never approve (FR-BES-06). **Open:** the creator cannot yet edit a rejected proposal (there is no species edit operation); the taxonomy build after approval (US-POK-03) does not exist yet; wishes are not re-pointed because the wishlist (WUN) does not exist (the port is ready, the wishlist implements it with its table); the kept care profile of a merge cannot be deleted or edited by the creator yet (no operation for a profile of a hidden species; it only shows the notice); a merge gives the creator no other hint (the specimens simply show the existing species); the AI connection (KI) does not exist yet, so only the missing role guards FR-BES-06 today; the weekly routine (US-DEV-03) has no runbook yet.

### US-BES-11 · Correct the catch date of a specimen · 🟨 new

As a **plant keeper** I want to correct the catch date of a specimen I already created, so that a wrong date (a typo, or a plant I owned long before the app) does not force me to archive and re-create the specimen and lose its history.

Acceptance criteria:

- Given my specimen and a catch date that exists in the calendar, is not before 1900-01-01 and is not after today's date in my time zone (profile, US-ACC-02; never the UTC date, NFR-08), when I save, then `Caught_At` is this date and nothing else of the specimen changes (name, marker, location, status, history). Today itself is allowed (FR-BES-04).
- Given a catch date after today's local date, when I save, then nothing is written and the error names the field and says that the catch date cannot lie ahead (the same rule and error as on creation, US-BES-02).
- Given a value that is not a calendar date (no time of day, no 31st of February) or lies before 1900-01-01, when I save, then nothing is written and the error names the field.
- Given an archived specimen, when I correct its catch date, then it is stored like for an active one, because archived specimens still count for the catch date in the Pokédex (US-POK-07). A catch date after the archiving date is refused and nothing is written; archiving date and reason stay unchanged (P-10).
- Given a specimen of another account or an unknown specimen, when I try to correct its catch date, then nothing is written and the answer is the same as for a specimen that does not exist (P-04).
- Given a corrected catch date, when I open the Pokédex, then the catch date of the species is derived from the stored value (earliest across my active and archived specimens, US-POK-07); it is never stored separately (P-01).
- After saving, the view says what changed: the specimen and its new catch date (P-09).

State of implementation: operation `specimen.correct_catch_date` (`POST /specimens/:id/catch-date`, `Idempotency-Key`, P-03) with the field and the rules of the creation: `catchDate` is a calendar date from 1900-01-01 on (else `input.invalid` on the field), not after today in the time zone of the request (`specimen.caught_in_future` on the field). Only `caught_at` changes in one statement under the row rule; an archived specimen is corrected too, but a date after its archiving date is refused with `specimen.caught_after_archived` on the field and nothing changes. A foreign or unknown specimen answers `specimen.not_found` (404) alike. The Pokédex date is derived from the stored value, nothing else is written. The card in the tab "Bestand" has "Fangdatum": a form with the stored date ("Bisher: …" or "unbekannt"), preset to it (or today when unknown) and limited to today; after saving the message names the specimen and the new date, a refusal marks the field with the German text of its code. **Open:** the section "Archiv" has no entry point, so an archived specimen can be corrected only through the API; the manual test protocol against the running app (story-test-protocol) is still missing.

### US-BES-12 · Fill the catalog once from open sources · ⬜ new

As an **operator** I want the catalog fields of a species to be fetched once from open data sources and stored with their source, so that keepers get complete profiles without the app asking a foreign service on every view.

Acceptance criteria:

- Given an approved species (US-BES-10) or an operator batch, when it enters the catalog, then a background job fetches its values from the sources chosen in E-25, stores the raw answer per source (DM-BES-05) and fills the empty catalog fields from it; each value carries its source and retrieval date (DM-BES-06).
- Given a keeper who views, searches or swipes species (catalog, Pokédex, Discover), when the view loads, then it reads only the stored catalog; no request to a foreign source runs on behalf of a keeper (FR-BES-18).
- Given two sources with different values for the same field, when the job fills the field, then it takes the value of the source ranked first for that field (FR-BES-17), never a mean, and marks the field as disputed for the review (US-BES-16).
- Given a value on a scale of its own (for example lux or an ecological light indicator), when it is stored, then the raw value stays in the source snapshot and the catalog value is converted by a tested rule; the limits of the rule are marked as assumptions (P-08).
- Given a field that no source fills, when the job ends, then the field reads "unbekannt" and appears in the gap list of the species (US-BES-13); nothing is guessed (P-08).
- Given a source that is down, slow or over its limit, when the job runs, then it retries later with backoff and records the failure in the error list of the job; already stored values stay (P-10).
- Given a reviewed value, when a later run brings a different value, then the reviewed value stays and the difference becomes a correction for the review (FR-BES-19), never a silent overwrite.
- A monthly routine (US-DEV-03) compares the stored snapshots with the sources and reports the differences to the operator.

### US-BES-13 · Fill the remaining gaps once by AI research · ⬜ new

As an **operator** I want the fields that no open source fills to be researched once by an AI client and handed in as a marked draft, so that the catalog becomes complete without anyone typing every profile by hand.

Acceptance criteria:

- Given the gap list of the catalog (fields "unbekannt" after US-BES-12), when the operator starts a research task, then the AI client researches the gaps per species and hands them in through the validating operation for profiles (US-KI-03, US-KI-05); there is no AI built into the app (E-19).
- Given an AI result, when it is stored, then every value carries the source the client names, the marking `ai-created, unreviewed` (DM-BES-01) and the AI connection (KI-R5); a value without a source is refused.
- Given an AI value for toxicity to pets, when it has no citable source, then it is not stored as a fact (US-KI-06, DM-ENT-01); the field stays "unbekannt".
- Given an AI value, when the open sources (US-BES-12) already filled the field, then the AI value does not replace it; at most it becomes a correction for the review (US-BES-16).
- Given AI values in the catalog, when a keeper sees them, then they are marked as AI-researched and unreviewed until a reviewer approves them (FR-BES-06).

### US-BES-14 · Report a wrong value or propose a correction · ⬜ new

As a **plant keeper** I want to say that a value in a species profile is wrong or missing and propose the right one, so that the shared catalog gets better from what keepers observe.

Acceptance criteria:

- Given a species profile, when I choose "Stimmt nicht" at a field, then I can report the field with a reason and optionally propose a value; the proposal names the field, the old value, the new value, a reason and a source (DM-BES-07).
- Given a proposed value for a field that needs a source (light demand, dormancy, temperature, humidity, toxicity; FR-BES-14), when I give no source, then the proposal is refused with the field named; a pure report without a value needs no source.
- Given a value of the wrong type or range for the field (DM-BES-01, DM-ENT-01), when I submit it, then nothing is stored and the error names the field (P-03).
- Given my open correction, when I look at the species, then I see it as "in Prüfung" and can withdraw it; it changes nothing in the catalog until a reviewer accepts it (FR-BES-02).
- Given an open correction by me or someone else for the same field and value, when I want to propose the same, then I am pointed to the open one and can confirm it (US-BES-15) instead of creating a duplicate.
- Given my own care profile, when I disagree with a catalog value only for my location, then the view points me to the care profile (US-BES-09) instead of a correction; a correction is for values that are wrong for everyone.
- After submitting, the view says what happens next: who reviews it and that I get a hint with the result (P-09).

### US-BES-15 · Confirm or dispute catalog values and corrections · ⬜ new

As a **plant keeper** I want to confirm or dispute a value or an open correction, so that reviewers see which entries the community trusts and which need a look first.

Acceptance criteria:

- Given a catalog value or an open correction, when I choose "Stimmt" or "Stimmt nicht", then my vote is stored once per account and item (DM-BES-08); choosing again changes or withdraws it.
- Given votes on an item, when anyone views it, then they see the counts of confirmations and disputes, never who voted; there is no score, rank or public profile per person (non-goals in `16`, P-05).
- Given a catalog value with more disputes than confirmations, at least 3 disputes (starting value, assumption), when the review list is built, then the value appears there as disputed (US-BES-16).
- Given votes, when a reviewer decides, then the votes are a signal and never change the catalog by themselves (E-26).
- Given an account that votes on many items in a short time (more than 50 votes per hour, starting value, assumption), when it votes again, then the vote is refused with a hint to try later.
- Given a species that is still a private proposal (FR-BES-11), when another keeper looks for it, then it cannot be voted on.

### US-BES-16 · Review corrections and keep the history of every value · ⬜ new

As an **operator (reviewer)** I want to work through reported values, corrections and source differences in one place and see where every value came from, so that the catalog stays correct and every change can be traced and undone.

Acceptance criteria:

- Given open corrections, disputed values (US-BES-15) and source differences (US-BES-12), when I open the review list (US-BES-10), then each entry shows the field, the current value with its source, the proposed value with its source, the reason, the counts of confirmations and disputes and its age; disputed values and entries with more confirmations come first.
- Given a correction, when I accept it, then the field takes the new value with its source, the catalog gets a new version (FR-BES-12), the provenance of the field records "community" and the reviewer (DM-BES-06), and keepers who have not overridden the field get the hint of FR-BES-12.
- Given a correction, when I reject it, then I give a reason; the creator sees the reason as a hint in the app, the catalog stays unchanged.
- Given a field, when anyone opens its history, then they see every version with value, source, origin (source, AI, community, reviewer) and date; personal names are not shown to other keepers (P-05).
- Given an accepted change that turns out wrong, when I revert the field to an earlier version, then the earlier value with its source comes back as a new version; nothing is deleted from the history (P-10).
- An AI connection can never accept, reject or revert (FR-BES-06, FR-KI-09).

## Data model

### DM-BES-01 Species (catalog)

| Field                                           | Type            | Meaning                                                                                                                                                                                        |
| ----------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latin name                                      | Text            | Genus + epithet, optional cultivar; normal form "Genus epithet"                                                                                                                                |
| German name, English name                       | Text            |                                                                                                                                                                                                |
| Synonyms                                        | List            | former or deviating names; search and import find the species through them, the technical id stays the same                                                                                    |
| Family (German, Latin)                          | Text            |                                                                                                                                                                                                |
| Difficulty                                      | Number 1–3      | 1 Easy, 2 Medium, 3 Hard (solves B-05)                                                                                                                                                         |
| Default level                                   | Number 2–4      | Level of the default; level 1 never for adults. The account's zone is **derived** from it and from the light demand (FR-BES-10), not linked, because zones are data of the account (US-LIC-05) |
| Light demand (lux)                              | Number          | Demand for maximum growth                                                                                                                                                                      |
| Dormancy from/until                             | Month-day       | may cross the new year                                                                                                                                                                         |
| Location growth/dormancy (hint)                 | Text            | Recommendation (e.g. "cool windowsill"); the keeper assigns own locations                                                                                                                      |
| Growth measure                                  | Enum/text       | exactly one measurement dimension (height, rosette diameter, shoot length)                                                                                                                     |
| Etiolation signs                                | Text            | species-specific symptoms of lack of light                                                                                                                                                     |
| Watering hint, substrate, pruning, growth hacks | Text            | one sentence each                                                                                                                                                                              |
| Success criteria                                | Text            | observable signs of optimal care                                                                                                                                                               |
| Botanical story                                 | Text            | Family, origin, peculiarities                                                                                                                                                                  |
| Review status                                   | Enum            | `curated`, `reviewed`, `ai-created, unreviewed` (operator batch, visible to all, marked) and `proposal` (user proposal, visible only to the creator, FR-BES-11)                                |
| Created by                                      | Enum            | `operator`, `reviewer`, `user`; for AI creation additionally the connection (KI-R5)                                                                                                            |
| Version                                         | Number, history | every change creates a version (FR-BES-12)                                                                                                                                                     |
| Source                                          | Text/link       | Origin of the details                                                                                                                                                                          |
| Image, image source, license                    |                 | Wikipedia/Commons with license                                                                                                                                                                 |
| Attributes (optional)                           |                 | Humidity, min. temperature, growth size, toxic to pets, each with source; for Discover (DM-ENT-01)                                                                                             |

### DM-BES-02 Specimen

| Field                 | Required         | Meaning                                                                                                                                                                  |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner                 | yes              | Account                                                                                                                                                                  |
| Species               | yes              | Reference into the catalog                                                                                                                                               |
| Name                  | yes              | derived per DM-BES-03, not by hand                                                                                                                                       |
| Marker                | with >1 specimen | see US-BES-03                                                                                                                                                            |
| Addition              | no               | `var.`, `subsp.`, `f.` or cultivar (US-POK-06, chip on the card); does not belong in the species name                                                                    |
| Location              | yes              | Reference to a location of the keeper (US-LIC-05)                                                                                                                        |
| Light zone (override) | no               | overrides the species zone (cutting)                                                                                                                                     |
| Status                | yes              | `Plant`, `Cutting`, `Archived`                                                                                                                                           |
| Caught_At             | no               | Date, optional on creation (back-dating allowed, never in the future, FR-BES-04), correctable later (US-BES-11); if missing, the creation date counts as "≈" (US-POK-07) |
| Provenance            | no               | `{From, Swap, Date}` (US-SOZ-11)                                                                                                                                         |
| Share, Share_Photos   | no               | Sharing setting (US-SOZ-04)                                                                                                                                              |

Rule: the specimen takes precedence over the care profile, this over the catalog (FR-BES-09).

### DM-BES-03 Naming rule

1 specimen: `Species` · 2 specimens: `Species` and `Species – marker` · from 3: each `Species – marker`. The separator is an en dash with spaces. The name is display text; the identity of the specimen is a technical id.

### DM-BES-04 Care profile (account × species)

Account-specific deviations from the catalog values of a species. Private, never part of a sharing setting.

| Field                               | Meaning                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Account, species                    | Key; one profile per account and species                                               |
| Target location growth / dormancy   | Reference to locations of the account (FR-PHA-02)                                      |
| Light zone (override)               | Reference to a zone of the account; without entry the derived zone applies (FR-BES-10) |
| Dormancy from/until (override)      | Month-day, may cross the new year                                                      |
| Watering interval growth / dormancy | Days (US-MON-05); starting value from the catalog's watering hint                      |
| Own hints                           | Free text, private (substrate, pruning, watering)                                      |

### DM-BES-05 Source snapshot (species × source)

The raw answer of one data source for one species, kept so that conversions can be corrected later without asking the source again (US-BES-12). Shared like the catalog, never per account.

| Field             | Meaning                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| Species, source   | Key; one current snapshot per species and source, older ones stay as history |
| Source identifier | The species identifier at the source (for example the taxon key)             |
| Retrieved at      | Date and time of the request                                                 |
| Source link       | Link to the species at the source, for attribution                           |
| License           | License of the data as the source states it (E-25)                           |
| Raw answer        | The answer as received, unchanged                                            |

### DM-BES-06 Field provenance (species × field × version)

Where a catalog value comes from. Every set catalog field has one current entry; older ones form the history (US-BES-16, FR-BES-12).

| Field          | Meaning                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| Species, field | Key together with the version                                                               |
| Version        | Number of the catalog version that set the value                                            |
| Value          | The value as stored in the catalog                                                          |
| Origin         | `source`, `ai`, `community`, `reviewer`, `operator`                                         |
| Source         | Source name and link, or the cited work; required except for origin `reviewer` on free text |
| Set at, by     | Date; account or connection (shown to reviewers only, P-05)                                 |
| Disputed       | Yes when sources differ or the votes say so (US-BES-12, US-BES-15)                          |

### DM-BES-07 Correction (catalog)

A keeper's report or proposal for one field of an approved species (US-BES-14). Not to be confused with a proposal of a new species (FR-BES-11).

| Field           | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| Species, field  | What it is about                                                    |
| Old value       | The catalog value when the correction was made                      |
| Proposed value  | Optional; empty for a pure report                                   |
| Reason          | Required, free text                                                 |
| Source          | Required for a proposed value of a field that needs one (FR-BES-14) |
| Status          | `open`, `accepted`, `rejected`, `withdrawn`                         |
| Created by, at  | Account and date; visible to reviewers only (P-05)                  |
| Decision reason | Required on rejection, visible to the creator                       |

### DM-BES-08 Vote

One account's "Stimmt" or "Stimmt nicht" on a catalog value or an open correction (US-BES-15).

| Field         | Meaning                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Account, item | Key; item = a field of a species or a correction; one vote per account and item |
| Direction     | `confirm` or `dispute`                                                          |
| At            | Date; votes are counted, never shown per person                                 |

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                               | Status                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR-BES-01 | Species (knowledge) and specimen (pot) are separate entities; specimens carry only individual fields.                                                                                                                                                                                                                                                                                                                                     | 🟨                                                                                        |
| FR-BES-02 | The species catalog is shared; changes to it are operator or review actions, users can make proposals (E-02).                                                                                                                                                                                                                                                                                                                             | 🟨                                                                                        |
| FR-BES-03 | Name conflicts are checked before every change, no partial state arises.                                                                                                                                                                                                                                                                                                                                                                  | 🟨                                                                                        |
| FR-BES-04 | `Caught_At` is filled with the user's local date (NFR-08) unless the keeper gives a catch date when creating the specimen; a given date may lie in the past (back-dating, not before 1900-01-01) but never after today's local date. The keeper can correct it later under the same rules (US-BES-11); on an archived specimen it may not lie after the archiving date.                                                                   | 🟨                                                                                        |
| FR-BES-05 | A species profile requires complete required fields (DM-BES-01) including growth measure, etiolation signs and success criteria. The light zone follows the saturation point, not survival (US-LIC-01).                                                                                                                                                                                                                                   | 🟨                                                                                        |
| FR-BES-06 | An AI-created profile is marked as such until a human has reviewed it. The AI may not mark a profile as `reviewed` (US-KI-03).                                                                                                                                                                                                                                                                                                            | ⬜                                                                                        |
| FR-BES-07 | One growth measure dimension per species is fixed and appears as an input in the measurement form.                                                                                                                                                                                                                                                                                                                                        | ⬜                                                                                        |
| FR-BES-08 | Species view (catalog, light overview) and specimen view (phases, growth, treatments, cards) stay separately named.                                                                                                                                                                                                                                                                                                                       | ⬜                                                                                        |
| FR-BES-09 | **Three layers:** catalog species (shared, only reviewers change), care profile (account × species, DM-BES-04), specimen. Specimen before care profile before catalog applies. **Changeable only in the catalog:** names, taxonomy, growth measure, etiolation signs, success criteria, story, image, attributes, difficulty. **Overridable in the care profile:** target locations, light zone, dormancy, watering intervals, own hints. | ⬜                                                                                        |
| FR-BES-10 | **Derive the zone instead of linking:** the catalog carries lux demand and default level. The account's zone follows from the lux demand and the account's zones by the rule from US-LIC-01 (80 % and 30 % limits) and is implemented as pure logic with tests. An override in the care profile takes precedence.                                                                                                                         | 🟨 Logic (LIC-01); override in the care profile (BES-09) counts in the light distribution |
| FR-BES-11 | **Visibility:** user proposals (`Proposal`) are visible only to the creator until a reviewer approves them (US-BES-10). Operator batches are visible immediately and marked. Specimens of a still private species cannot be shared (US-SOZ-04) and do not count in the Pokédex. On approval or merge, references are re-pointed, nothing is lost.                                                                                         | 🟨                                                                                        |
| FR-BES-12 | **Changes to the catalog** are versioned. If an impact-relevant field changes (dormancy, lux demand, default level), keepers who have not overridden the value receive a hint (P-10).                                                                                                                                                                                                                                                     | ⬜                                                                                        |
| FR-BES-13 | **Growth measure locked:** as soon as an account has a measurement for the species, the growth measure can no longer be changed. A change is only possible by the operator with conversion of the measurement series (FR-BES-07).                                                                                                                                                                                                         | ⬜                                                                                        |
| FR-BES-14 | **Review:** `reviewed` requires complete required fields (FR-BES-05) and sources for light demand and dormancy. The reviewer is initially the operator; further reviewers are a role (TE-08). Contributions by users to the catalog need a grant of rights in the terms of use (E-12).                                                                                                                                                    | 🟨                                                                                        |
| FR-BES-15 | **Source snapshots:** the raw answer of every data source is stored per species and source with retrieval date, link and license (DM-BES-05). Conversions into catalog values can be repeated from the snapshot without a new request.                                                                                                                                                                                                    | ⬜                                                                                        |
| FR-BES-16 | **Provenance per value:** every catalog value carries its origin, source and date (DM-BES-06). The species profile shows the source next to the value; a value without origin is not shown as a fact (P-08).                                                                                                                                                                                                                              | ⬜                                                                                        |
| FR-BES-17 | **Combining sources:** per field there is a fixed order of sources (E-25). The first source that has a value wins; values are never averaged. Differing values mark the field as disputed for the review.                                                                                                                                                                                                                                 | ⬜                                                                                        |
| FR-BES-18 | **No foreign request at view time:** views and operations that a keeper triggers read only the stored catalog. Foreign sources are asked only by background jobs (US-BES-12, US-POK-03) through the source client (NFR-17).                                                                                                                                                                                                               | ⬜                                                                                        |
| FR-BES-19 | **No silent overwrite:** a reviewed value is never replaced by a job, an AI result or a vote. A differing value becomes a correction for the review (US-BES-16); accepting it creates a catalog version (FR-BES-12).                                                                                                                                                                                                                      | ⬜                                                                                        |
| FR-BES-20 | **License gate:** a source feeds the stored catalog only if its license allows storing and the use the product makes of it (E-25); its attribution is shown with the value. Data under share-alike or non-commercial terms is not stored until E-25 allows it.                                                                                                                                                                            | ⬜                                                                                        |
| FR-BES-21 | **Community rules:** corrections and votes are possible only for approved species and only for signed-in keepers; one vote per account and item; counts are shown, persons are not (P-05); no score, rank or public profile per person. Corrections and votes are subject to the grant of rights in the terms of use (E-12) and to a rate limit (starting value, assumption: 50 votes and 20 corrections per account and hour).           | ⬜                                                                                        |
