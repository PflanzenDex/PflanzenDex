# 14 – Epic QS: Cross-Cutting (Privacy, Security, Mobile, Quality)

Non-functional requirements for all epics. All ⬜. The yardstick is the product principles P-01 to P-11 (`00-Product-Overview.md`).

## User stories

### US-QS-01 · Nothing depends on remembering · ⬜ (prototype 🟡)

As a **plant keeper** I want the system to report need for action itself.

Acceptance criteria:

- Phase changes, due treatments, overdue measurements and wishlist buffer trigger a reminder (epic MON) without the app being opened.
- The start page "Today" shows the same items (one source, `FR-MON-03`).

### US-QS-02 · Logic is testable · ⬜ (prototype 🟡)

As a **developer** I want to secure every calculation with tests.

Acceptance criteria:

- Phase, rate, trend, light zone counting, prioritization, naming rule, rank, milestones, swap states and feed derivation exist as pure logic without I/O and have tests.
- Every story with status ✅ has at least one test whose name carries the story ID (P-06).

### US-QS-03 · Repeatable without fear · ⬜ (prototype ✅)

Acceptance criteria:

- Every writing operation is idempotent or prevents double execution (double click, repeat after abort).
- Background jobs (reminders, catalog enrichment, photo processing) deliver the same result on repetition.

### US-QS-04 · Deviations become visible · ⬜ (prototype ✅)

Acceptance criteria:

- Wrong location, overdue treatment, buffer undercut, etiolated last measurement, data gaps appear as a warning with an instruction for action (P-09).
- Data that would be missing in an evaluation (specimen without species, without location) appears in a warning list (P-10).

### US-QS-05 · Privacy and control · ⬜ (prototype ✅ partly)

As a **plant keeper** I want to know and determine what happens with my data.

Acceptance criteria:

- Information, export and complete deletion of the account (see `US-ACC-04`).
- Photos are freed of EXIF/GPS before storage and reduced to a maximum size (prototype: long side 1600 px, quality 82).
- Location, growth notes, treatments, prices and financial data are never transmitted to friends or partners (FR-SOZ-01, FR-EQU-08).
- A page "What is measured?" names usage measurement and click counting; without consent nothing is counted.

### US-QS-06 · Sources and licenses · ⬜ (prototype ✅)

Acceptance criteria:

- Wikipedia texts and images (CC BY-SA) are shown with source link and license statement (FR-POK-07).
- User images remain the property of the user; passing on only after sharing.
- Partner links are labeled (FR-EQU-05).

### US-QS-07 · Usable on mobile · ⬜ new

As a **plant keeper** I want to operate the app on the phone next to the plant.

Acceptance criteria:

- All everyday flows (measuring with photo, confirming watering/location, ticking off treatment, Today list) can be operated with one hand and without horizontal scrolling.
- The app is installable (home screen) and shows the last loaded data when there is no network; write actions are buffered and delivered when the network returns, without duplicate entry (`US-QS-03`).
- Photo capture directly from the camera.

## Non-functional requirements

| ID     | Requirement                                                                                                                                                                                                                                 | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| NFR-01 | **Data format:** fields have fixed, validated types (number, date, enum). Free text carries only content, no logic.                                                                                                                         | ⬜     |
| NFR-02 | **Input without editing files:** everything goes through forms, buttons or the keeper's AI client.                                                                                                                                          | ⬜     |
| NFR-03 | **Single source:** species knowledge stands once in the catalog; specimens carry only deviations.                                                                                                                                           | ⬜     |
| NFR-04 | **Live derivation:** ownership, distribution, phases, trends are computed from raw data; no second copy is maintained.                                                                                                                      | ⬜     |
| NFR-05 | **No invented numbers** (P-08).                                                                                                                                                                                                             | ⬜     |
| NFR-06 | **Nothing disappears silently** (P-10).                                                                                                                                                                                                     | ⬜     |
| NFR-07 | **Instruction for action instead of data graveyard** (P-09).                                                                                                                                                                                | ⬜     |
| NFR-08 | **Time zones:** all calendar dates are local dates of the user; phase calculation and reminders use the time zone of the user profile. No shift through UTC (solves B-01).                                                                  | 🟨     |
| NFR-09 | **Tenant isolation:** test that user A can never query or change data of user B, without friendship and sharing (P-04).                                                                                                                     | ⬜     |
| NFR-10 | **Security:** sign-in via an established service, not built ourselves (E-03). Sessions revocable. Input validated, file uploads checked for type and size.                                                                                  | ⬜     |
| NFR-11 | **Privacy (GDPR):** legal bases and consents documented, hosting in the EU (assumption, E-01), data processors named, deletion concept, data export. Privacy policy and imprint before the first external user.                             | ⬜     |
| NFR-12 | **Performance:** the start page "Today" and the collection view are usable for 100 specimens without noticeable waiting time (assumption, on a phone with an average network).                                                              | ⬜     |
| NFR-13 | **Accessibility:** operation by keyboard, contrast, alternative texts for photos (species/specimen name). Status never only via color or emoji.                                                                                             | ⬜     |
| NFR-14 | **Language:** UI initially German; display `DD.MM.YYYY`, storage ISO. Texts are exchangeable (later translation).                                                                                                                           | ⬜     |
| NFR-15 | **Backups and restore:** regular backup of user data and photos, restore tested.                                                                                                                                                            | ⬜     |
| NFR-16 | **Costs in view:** operating costs (hosting, storage, load from AI connections) are measured and shown per user, so that `13-Business-Case.md` is based on data.                                                                            | ⬜     |
| NFR-17 | **External sources** (Wikipedia, Wikidata, GBIF, OpenTree) are queried throttled and cached; failure of a source blocks no user function.                                                                                                   | ⬜     |
| NFR-18 | **Observability:** errors and failed jobs are visible (log, alarm to the operator), without logging user data in plain text.                                                                                                                | ⬜     |

## Principles check per epic

| Question                          | Care (BES–BEH)   | Pokédex                       | Social                               | Reminders                     |
| --------------------------------- | ---------------- | ----------------------------- | ------------------------------------ | ----------------------------- |
| Trigger without remembering?      | Reminder (MON)   | Catch automatically from stock | Notification on need for action     | yes                           |
| Fixed, validated format?          | yes              | yes                           | yes                                  | yes                           |
| Check against deviation?          | ⚠️ in "Today"    | Catalog/enrichment gaps       | Sharing hints                        | Sensor "silent"               |
| Idempotent?                       | yes              | yes                           | yes (swap states)                    | yes (once per occasion and day) |
| Human delivers only human things? | yes              | yes                           | yes                                  | yes                           |
| Says what to do?                  | yes              | "N more: …"                   | Requests with action                 | yes                           |
