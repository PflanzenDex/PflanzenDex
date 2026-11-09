# 05 – Epic WAC: Growth, Etiolation and Photos

Goal: success is measured against the **own** history of each plant, not against invented species averages, and length gain caused by lack of light does not count as success.

Prototype reference: epic WAC. Differences: measuring on the phone with a camera, photo processing on the server, AI assessment as a suggestion (epic KI), date in the user's time zone (NFR-08, solves B-01).

## User stories

### US-WAC-01 · Record a measurement · ✅ (prototype ✅)

As a **plant keeper** I want to save a measured number per specimen, so that the history grows.

Acceptance criteria:

- Per specimen the view shows: "What to measure?" (growth measure of the species), last measurement, rate, trend, last assessment and the input form.
- Input: number (step 0.5 cm), quality, optional note, optional photo. Non-numeric or negative input is rejected without writing.
- The date defaults to today in the user's time zone and is changeable (adding retroactively).
- The view names the growth measure of the species and reminds the keeper to measure that dimension at the same place: "Miss immer dasselbe Maß an derselben Stelle, sonst sind die Werte nicht vergleichbar." This is a hint only; nothing enforces it (owner decision 2026-11-09).
- Saving is idempotent (US-QS-03).
- Given the layer "Verlauf" of the page "Measure", then it fits one screen (US-QS-15) with a segment "Überblick | Kurve | Messungen", starting on "Überblick": "Überblick" shows what to measure, the growth and the last assessment; "Kurve" shows the growth chart; "Messungen" shows the measurements with their photos, newest first, paged by the free height of the layer. The chosen part is part of the address (`&teil=`), so a reload keeps it. (Owner decision 2026-11-05.)
- Given the measure view of a specimen ("Messen"), when I open it, then its address names the specimen (`?form=measure&plant=<id>`, US-QS-15): Back closes it, a reload opens it for the same specimen, and Back with a typed value asks "Eingabe verwerfen?" first.

State of implementation: the view "Measure" per specimen shows "Was messen?" (growth measure of the species; without it "Wachstumsmaß unbekannt: Wähle selbst Höhe, Rosettendurchmesser oder Trieblänge und bleib dabei."), the last measurement, the last assessment, the input form and the course, the layer "Verlauf" in the three parts "Überblick", "Kurve" and "Messungen" (US-QS-15, the criterion above). Input: number on the grid of 0.5 cm (assumption: the grid also applies on the server so that nothing is rounded silently), quality (preset `Gesund`), optional note; the date defaults to today in the profile's time zone (US-ACC-02; the device's zone only as fallback while none is chosen), is changeable and not in the future (assumption: a typo in the year would distort every later rate); an emptied date, or a typed one that is no real day, is refused in the form and writes nothing (P-10), the server refuses an empty date too and takes a missing one as today for API callers. Invalid input writes nothing; saving goes through `measurement.record` with `Idempotency-Key`. The optional photo has an upload control in the form (processing US-WAC-06, showing it US-WAC-05); the page shows one fact line (last measurement, value and date) with the link "Verlauf (n)"; what to measure, rate and trend (US-WAC-03) and the last assessment sit in the layer "Verlauf" above the course with its photos; the note and the photo of the form sit behind "Mehr Angaben" (closed); "Messung speichern" is a sticky footer (#1037), the rule that etiolated growth overrides the trend is in the view (US-WAC-04). That the same dimension is always measured at the same place is the reminder of the view (criterion d, owner decision 2026-11-09); nothing enforces it.

State of implementation (2026-11-09, gap analysis of origin/dev and owner decision): criteria a to c and e to g are implemented and tested (the web form and the core operation `measurement.record`, the Verlauf layer with its three parts and `&teil=`, the back navigation with "Eingabe verwerfen?", the save confirmation). The emptied date is refused in the form with a German text (`care/shared/shared.de.json`, test "US-WAC-01 an emptied date is refused in the form"), the core test "an emptied date (empty text) is refused and writes nothing" holds on the server, and the form's default date is today in the profile's time zone (test "the form's date is today in the profile's zone"). Manual protocol on mobile 375×812 and desktop: `docs/records/test-logs/wac-01.md`, section US-WAC-01. Status ✅.

### US-WAC-02 · Assess etiolation while measuring · ✅ (prototype ✅)

Acceptance criteria:

- Choice `Healthy` / `Etiolated/thin` (default `Healthy`).
- If the species has etiolation signs, they can be shown at the choice field ("how to recognize?").
- A measurement without quality (imported legacy data) counts as `Healthy`.

State of implementation: the form "Measure" offers the choice `Gesund` / `Vergeilt/dünn`, preset `Gesund`; `measurement.record` accepts only these two values and stores `healthy` when the quality is missing or empty. In the database the column `quality` is required with the default `healthy`, so a row written without quality (imported legacy data) reads back as `healthy` and no measurement is ever left without one (no new migration: the column exists since US-WAC-01). The "Measure" view carries the etiolation signs of the species (catalog field, required on approval); the form shows them behind the closed disclosure "Wie erkennen?" next to the choice. If the species is not visible or the text is empty, the view says `null` and the form shows no disclosure instead of an invented text (P-08). The AI suggestion of the quality belongs to US-WAC-06/US-KI-04; how the quality overrides the trend belongs to US-WAC-04.

### US-WAC-03 · Growth rate and trend against the own average · ✅ (prototype ✅)

Acceptance criteria:

- Zero measurements: "no measurement yet". One: "1 measurement — no rate yet".
- From two measurements: overall rate in cm/year = (Δ value / Δ days) × 365 between first and last measurement.
- From three: trend = last interval rate against the mean of all previous interval rates. Relative deviation > +10 % → faster, < −10 % → slower, otherwise stable. A mean of 0 counts as stable.
- With two measurements: "from the 3rd measurement you will see a trend here".
- Two measurements on the same day or in the wrong order (Δ days ≤ 0) yield no rate; before the evaluation the measurements are sorted by date.
- **No** comparison with a species average (P-08). As soon as enough own data of all users is available, a comparison can be introduced, only with sample size and minimum count (see non-goals in `16-Releases-and-Decisions.md`).

State of implementation: `growthTrend` (core, pure, derived on demand) feeds the `growth` field of the Measure view; the view shows rate (cm/year) and trend. Decisions (assumption, decided by the PO): an interval with Δ days ≤ 0 is skipped, so the trend needs at least two intervals of positive length; the relative deviation divides by the absolute mean, so a negative mean works; with three or more measurements but no usable trend the view says "noch kein Trend" (unknown, P-08). The etiolation override is US-WAC-04. FR-WAC-02: rate and trend come only from the specimen's own measurements (`growthTrend` has no species-average input, a test asserts the result has no such field; the view shows "unbekannt" or an explaining text where the data does not reach, P-08); the only numbers shown are the keeper's own measurements and values derived from them. FR-WAC-07: several measurements on one day are allowed (`measurement.record` test, back-filling), yield no rate (Δ days = 0, `growthTrend` test) and the photo and the cards use the one recorded last. FR-WAC-05: cuttings are measured like plants (no refusal for status `cutting`); the view carries the derived `status` and the "Measure" view marks a cutting with the badge "Steckling" (a plant gets no marker). FR-WAC-03: the 10 % threshold is `GROWTH_DEFAULTS.trendTolerance` (core, one documented place, assumption decided by the PO); `growthTrend` takes an optional `tolerance` for tests and later tuning, an unusable value falls back to the default. The spec does not ask for a per-account setting, so there is none.

### US-WAC-04 · Etiolation overrides the trend · ✅ (prototype ✅)

Acceptance criteria:

- If the quality of the last measurement is `Etiolated/thin`, the view shows "Growth etiolated/thin — despite the rate no success signal, see success criteria", regardless of the rate.
- A rising trend counts as a success signal only together with `Healthy`.

State of implementation: `growthTrend` (core, derived on demand, never stored) takes the quality of each measurement and returns `signal`: `etiolated` if the latest measurement by date is rated etiolated (regardless of rate or trend, even with a single measurement), `success` only for a faster trend with a healthy latest measurement, otherwise `null`. A missing quality counts as healthy (US-WAC-02). The view keeps showing the rate and replaces the trend line by the etiolation text (German UI text), or appends "(Erfolgssignal)" on success. Earlier etiolated measurements do not override a healthy latest one.

### US-WAC-05 · View history and photos · ✅ (prototype ✅)

Acceptance criteria:

- History chart per specimen (value over time) with marking of etiolated measurements.
- Photo series in time order; the specimen card (US-BES-06) shows the latest photo.
- "Last assessment" shows date and note of the last measurement.

State of implementation: the "Measure" view shows a history chart (value over time, own measurements only, etiolated ones as hollow diamonds, not by colour alone), the course lists each measurement with its photo in time order, and "Letzte Bewertung" shows quality, date and note. The photo is private (P-05): `GET /specimens/:id/measurements/:measurementId/photo` serves the cleaned WebP only to the owner (`measurement.photo_not_found` 404 without a photo; a foreign specimen looks missing), the web fetches it with the token and shows it with alternative text. The form has an optional file input (JPEG, PNG, WebP, checked for type and size before sending); the photo is sent after the measurement is saved, for its date; a refused photo leaves the measurement saved and shows the German text of its code. Replacing an existing photo needs no dialog in the form because a new measurement never has one. The specimen card (US-BES-06) shows the most recent photo of the specimen (`MeasurementStore.lastPhotoFor`; it can come from an older measurement than the last one). The card gets only the private API path and fetches the image with the token (object URL, link opens it large); without access or if loading fails the card says so by the error code text. A photo can be added to or replaced on an existing measurement from the course: the first try never replaces; on `measurement.photo_exists` a dialog asks for confirmation, then the request repeats with `replace=true`. Because the server attaches a photo to the day's latest measurement (FR-WAC-07), only that measurement of a day offers the control.

### US-WAC-06 · Have a photo assessed and store it · 🟨 (prototype ✅)

As a **plant keeper** I want to have a photo assessed, so that measured number, judgment and picture belong together.

Acceptance criteria (assessment):

- The keeper measures themselves and supplies the number. The AI assesses the photo **purely qualitatively** against success criteria and etiolation signs of the species and suggests `quality` and a short note (US-KI-04). The keeper accepts, changes or discards the suggestion.
- The AI assesses only what is visible; no estimation of height, substrate moisture or roots. If the basis is missing, the note stays empty.

Acceptance criteria (processing):

- On upload the image is rotated (EXIF orientation), the long side reduced to at most 1600 px, stored as WebP at quality 82 with a 256 px WebP thumbnail at quality 72 (starting values, assumption, chosen by the owner on 2026-11-05 from a measurement on 20 plant photos: about 26 % smaller than JPEG 82 at the same measured quality, issue 1289), **EXIF/GPS removed**. Wish images are stored the same way.
- The format was switched cleanly while no production data existed (no reader for the old format, no conversion job). A later format change, once real keepers have photos, needs its own migration decision and a fresh backup first.
- The photo belongs to the measurement of the same day; a second photo for the same measurement replaces only after confirmation.
- Invalid file, too large a file or a missing measurement abort with a clear message.

State of implementation: the processing and storing half works (release R1). `POST /specimens/:id/measurements/photo?timeZone=…&date=…&replace=true` takes the raw image file (`Content-Type` JPEG, PNG or WebP, `Idempotency-Key`) and runs `measurement.photo`: the image is rotated by EXIF, the long side reduced to at most 1600 px, stored as WebP (quality 82, thumbnail 72, issue 1289), EXIF/GPS removed, only the cleaned version is stored, never the original (FR-WAC-09, QG-D3). The photo belongs to the measurement of the given day (default today in the profile's time zone; with several measurements that day the one recorded last, FR-WAC-07); a second photo is refused with `measurement.photo_exists` until the request repeats with `replace=true`, then the old object is deleted after the new one is linked. Errors with German texts: `measurement.not_found` (no measurement that day), `media.too_large` (413), `media.type_unsupported` (415), `media.not_an_image` (422), `media.storage_unavailable` (502, no storage configured). Storage: column `measurement.photo` (migration `0031`). On the measure page the confirmation "Gespeichert" comes only after the photo is stored as well: while it uploads, "Foto wird gespeichert …" shows above the save button; a refused photo says that the measurement is kept and the photo is not, with the German text of its code (P-10, issue 1656). **Missing:** the AI assessment with the suggestion of `quality` and note (US-KI-04, release R4; `Assessed_By` stays `Keeper`), the status stays 🟨 (the upload control, the confirmation dialog for replacing and showing the photo exist, US-WAC-05).

### US-WAC-07 · Log new leaves at the detail I choose · 🟨 new

As a **plant keeper** I want to log each new leaf, as a quick tap or with its size, so I see how my plant develops.

Decisions (owner interview 2026-11-05, issue 1325): the keeper chooses the level for each leaf: just a tap, or with a photo, length and width, or a note on fenestration or variegation. The feature is opt-in (P-12). Comparisons use the keeper's own data only (P-08).

Acceptance criteria:

- Given a plant, when I choose "Neues Blatt", then one tap records a leaf with today's local date; a size, a note or an earlier date are optional, and a date in the future is refused (NFR-08).
- Given leaves of a plant, then the plant shows their number and the last leaves, newest first, paged when they do not fit (US-QS-15).
- Given the newest leaf has a length, and an earlier leaf has one too, then the plant says whether the newest is larger, smaller or the same size as the last earlier leaf with a length. Without a length on both, width is compared the same way. Length and width are never compared with each other.
- Given the newest leaf has no size, or no earlier leaf has the same measure, then no comparison is shown (P-08). The wording only states the size: a larger leaf is never called success, because etiolated growth never counts as success.
- Given a leaf logged by mistake, when I remove it and confirm, then it is gone and the number and comparison follow (P-03, P-10).
- Given a leaf, when I add a photo, then it is stored and shown like a measurement photo (US-WAC-06). Not built yet: a follow-up of issue 1325.
- Given the keeper switch for the leaf log is off, then the plant offers and shows no leaves, and the logged leaves stay; switched on again they are back (P-12, US-ONB-09).
- Given another account, then it can neither see nor change my leaves; the leaf log is not shared with friends (P-04, P-05).

State of implementation (issue 1325, first slice): `leaf.record` writes a leaf with one tap (today in the keeper's time zone, no size) or with the optional date, length and width in millimetres (whole numbers 1 to 5,000) and a note (at most 500 characters); a date in the future is refused with `leaf.date_in_future`, a bad size or note with `leaf.size_invalid` or `leaf.note_invalid`. `leaf.remove` takes a leaf back after confirmation; the read of a plant's leaves gives the count, the comparison and the leaves newest first. The comparison (`compareLeaves`, core, pure) takes the newest leaf (latest date, a tie is the leaf created last) against the last earlier leaf with a length; without that pair the width is compared the same way; length and width are never compared with each other; without a pair nothing is shown. Storage: table `leaf` (DM-WAC-02, tenant row rule, composite foreign key to the plant), migration `0108`. The keeper switch `leaf_log` is on by default (P-12): switched off, the list is empty and writes are refused with `onboarding.keeper_off`, and the rows stay. The web shows the leaf log in "Verlauf" of the plant layer: the count, the comparison sentence, the leaves in pages (`blfrom`), "Neues Blatt", the details form and removal that asks first. **Missing:** the photo of a leaf (the criterion of this story, a follow-up of issue 1325; DM-WAC-02 `Photo?` is not built); the status stays 🟨.

Decision (owner, 2026-11-06): the leaves sit behind a switch "Messungen | Blätter" in "Verlauf" of the plant layer. One list is shown at a time, and the address keeps the choice. With the keeper switch off, the switch is not shown.

## Data model

### DM-WAC-01 Measurement

`Specimen`, `Date` (local), `Value` (number, cm or unit of the growth measure), `Quality` (`Healthy` | `Etiolated/thin`), `Note?`, `Photo?`, `Assessed_By` (`Keeper` | `AI suggestion accepted`).

### DM-WAC-02 Leaf

`Specimen`, `Date` (local), `Length_mm?`, `Width_mm?`, `Note?` (fenestration, variegation), `Photo?`. Limits: a size is a whole number from 1 to 5,000 mm, a note at most 500 characters (starting values, assumptions).

## Requirements

| ID        | Requirement                                                                                                                                            | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| FR-WAC-02 | The rate is a comparison against the **own** history; numbers without a verifiable source are not shown (P-08).                                        | ✅     |
| FR-WAC-03 | The trend threshold ±10 % <!-- const: GROWTH_DEFAULTS.trendTolerance scale=100 --> is a default, centrally configurable in the logic.                  | ✅     |
| FR-WAC-05 | The growth view also shows cuttings, marked "Cutting". (Open question from the prototype, settled here: visible, because cuttings should be measured.) | ✅     |
| FR-WAC-07 | More than one measurement on the same day is possible, but yields no rate (Δ days = 0).                                                                | ✅     |
| FR-WAC-08 | A too old last measurement (default 30 days, adjustable) creates a reminder (US-MON-04). Cuttings use the same interval (E-11, decided by the PO).     | ⬜     |
| FR-WAC-09 | Photos are the property of the user. After processing only the cleaned version exists (no original with GPS).                                          | ✅     |
