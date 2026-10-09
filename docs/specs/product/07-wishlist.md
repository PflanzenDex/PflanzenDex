# 07 – Epic WUN: Wishlist and Acquisition Planning

Goal: new plants are acquired where the light system has room, and the candidate list does not run empty unnoticed.

Prototype reference: epic WUN. Differences: a purchase leads, guided, to the plant (solves B-09), images are saved locally instead of hotlinked, equipment candidates are added (epic EQU).

Note (US-QS-14): the wishlist is shown as the view "Wunschliste" of the destination "Sammlung"; the former destination "Wunschliste" no longer exists and its address leads there.

## User stories

### US-WUN-01 · See candidates prioritized by space need · 🟨 (prototype ✅)

Acceptance criteria:

- Open candidates (`Status: Wishlist`) are shown, sorted ascending by the stock of the respective target light zone (specimen count, zones 2–4; unknown zone last).
- Per candidate: photo with source, "German (name)", target zone with current stock ("— N plants"), difficulty, reasoning, actions.
- Without open candidates: "No open candidates in the wishlist."

State of implementation: partly done. The tab "Wunschliste" (`GET /wishes/candidates`) lists the open plant wishes (`status = wishlist`) sorted ascending by the specimen count of the target light zone (the same count as the light distribution, US-LIC-02: zones 2–4, `isActive`; ties by zone order, then name); a wish without a zone 2–4 comes last and says so. Each card shows the picture address as an explicit link "Bild ansehen (öffnet extern)" with its source next to it, "German (name)", "zone — N plants", difficulty (Easy/Medium/Hard), reasoning and why it stands there; the list says what to do next (P-09). Unknown values read "unbekannt" (P-08); nothing is compared with an average. A wish is recorded through the validating operation `wish.create` (name required, case-insensitive unique per account, picture only with source, zone only of the own account). Privacy decision: a keeper-typed address is never loaded by a viewer's browser (IP address, user agent, referrer; P-05); only an https address without credentials is accepted and it is a link the viewer follows on purpose (`rel="noopener noreferrer"`, no referrer). Since US-WUN-04 a Wikimedia Commons image can be stored locally with source and license; the card then shows that copy (fetched with the token, alternative text, "Quelle: …" and "Lizenz: …", unknown license reads "unbekannt") instead of the link. A wish whose target zone is not among zones 2–4 (for example cutting light) is kept, does not count and says so (FR-WUN-03); the hint list for such wishes does not exist yet. Missing: the species link and the discover source of DM-WUN-01 follow with their stories (the specimen link exists since US-WUN-05).

Repair of duplicate names (FR-WUN-06, migration 0020, issue 303): names are unique per account after folding diacritics, letter case and white space. Wishes that existed before the migration and collide only after folding were kept unchanged (nothing is deleted or renamed, P-10), but are exempt from the new rule (`name_key is null`); the migration only reported them as a warning in its output. The wishlist now shows them: above the candidates a hint says that these open wishes have the same name as another wish ("Diese Wünsche heißen gleich wie ein anderer: umbenennen oder zusammenführen"), lists each of them and offers two validating actions per wish: rename (the new name is checked like a new wish, so the wish gets its key and leaves the exempt group; a name that is taken still is refused with `wish.name_taken`) and delete (merge: the keeper keeps the other wish; asked for confirmation first, P-10). Both operations work only on wishes of the own account that still have no key; any other wish is refused with `wish.not_duplicate`, a foreign or unknown wish with `wish.not_found` (P-04). Without such wishes the hint does not appear.

### US-WUN-02 · Be warned before the list is empty · 🟨 (prototype ✅)

Acceptance criteria:

- Per zone 2–4 there should be at least **2** open candidates (buffer, adjustable).
- If a zone falls below the buffer, a warning appears "Replenishment needed: <zone> (N open candidates)" with the actions "Discover for <zone>" (US-ENT-07) and "Fetch suggestions" (US-WUN-04).
- The warning can come as a reminder (US-MON-01).

State of implementation: partly done. `GET /wishes/candidates` returns `replenishment` and the wishlist tab shows it above the list: every zone 2 to 4 with fewer open candidates (`status = wishlist`, target zone = that zone) than the buffer gets the line "Nachschub nötig: <zone> (N offene Kandidaten)", plus a next action that points to the form "Wunsch erfassen" (P-09). Wishes without a zone 2 to 4 count towards no zone (FR-WUN-03). Derived live, nothing stored (P-01). Assumption, decided by the PO: the buffer is the constant 2 (`REPLENISH_BUFFER`); the spec says "adjustable", an account setting follows with its own change (the derivation already takes the buffer as a parameter). Missing: the actions "Discover for <zone>" (US-ENT-07) and "Fetch suggestions" (US-WUN-04), which do not exist yet and are therefore not shown (`actions` in the answer says so); the reminder (US-MON-01).

### US-WUN-03 · Record a purchase · 🟨 (prototype ✅)

Acceptance criteria:

- "Bought" sets `Status: Bought` and hides the candidate from the list, but it stays in the history.
- The guided path to the plant follows (US-WUN-05).

State of implementation: partly done (both criteria are met, the guided path to the plant is US-WUN-05; the manual test protocol is missing). Every open candidate has the action "Gekauft". It runs the validating operation `wish.buy` (owner only, `Idempotency-Key`), which sets an open wish (`Status: Wishlist`) to `Bought` in one step; the wish leaves the candidate list (FR-WUN-02) but is never deleted and appears in the history, the section "Gekauft" below the list (bought wishes by name; readable on its own, without the page). The confirmation says what happened and what to do next: create the plant as a specimen (P-09, P-10). Decisions: buying a wish that is already bought changes nothing and answers with "already bought" instead of an error (idempotent, also for two calls at the same moment); only an open wish can be bought, a discarded wish is refused (`wish.not_open`) and stays discarded; a wish of another account is answered exactly like an unknown one (`wish.not_found`, P-04). The confirmation offers "Exemplar anlegen", the guided path from the purchase to the specimen (US-WUN-05). Not built: undoing "Bought" (US-ENT-04) and a purchase date (no date is invented, P-08; US-WUN-05 explains why it stays open).

### US-WUN-04 · Have new candidates researched · 🟨 (prototype ✅)

As a **plant keeper** I want suggestions that fit the zone.

Acceptance criteria:

- Request: target zone, number, exclusion (stock and existing candidates are excluded automatically).
- The keeper's AI client delivers drafts via US-KI-05 (path A) or a task (US-KI-08) where the botanical light demand **fits** the zone (not merely tolerates it), with a short reasoning (CAM, origin, leaf morphology).
- Image and image source are checked for reachability and license, not guessed; images are saved with source.
- Suggestions appear as a draft; the keeper accepts or discards them one by one.

State of implementation: partly done, the image half. A wish keeps its image only as a Wikimedia Commons address (file page `commons.wikimedia.org/wiki/File:…` or the upload address); "Bild speichern" on a candidate runs the validating operation `wish.store_image` (`POST /wishes/:id/image`, owner only, `Idempotency-Key`): the file is looked up at the Commons API through the source client (TE-09, new source `commons`), reachability and license are checked, not guessed, and only licenses that allow storing are used (assumption, decided by the PO: public domain, CC0, CC BY, CC BY-SA; no NC, no ND, none stated means refused). The original is downloaded from `upload.wikimedia.org` only (https, no redirect, size and time limit), processed by the media pipeline (TE-05: JPEG, at most 1600 px, no metadata) and stored under the account; the original is never kept. The wish records the verified source (author and file page) and the license; `wish.image_source_unsupported` (any other address or host, 422), `wish.image_not_found` (404) and `wish.image_license_unsupported` (422) refuse with a German text and store nothing; an image that is stored already is kept. Without storage or sources the route answers 502 `media.storage_unavailable`. The copy is private (P-05): `GET /wishes/:id/image` serves it to the owner only, the candidate list carries just a flag `stored` and never the object name, and the web fetches it with the token (never a foreign address in the browser). Column `wish.image_object` (migration 0042). Missing: the request with target zone and number, the AI client's drafts (US-KI-05 path A, US-KI-08 task) with the reasoning, and accepting or discarding drafts one by one; so there is no automatic suggestion yet, and images of other sources (Wikipedia thumbnails, GBIF) are not stored because they are not accepted (every image needs a verified origin and license).

### US-WUN-05 · Get from purchase to plant · 🟨 (prototype 🟡)

As a **plant keeper** I want as few steps as possible from purchase to specimen.

Acceptance criteria:

- After "Bought", creating a specimen opens with the species preselected (from the catalog; if it is missing, US-BES-01 starts with the name).
- The wishlist entry is linked to the specimen ("bought → specimen").
- Price and purchase date go, if recorded, to the finances/cost view (US-EQU-09); if they are missing, nothing is invented.
- `Discarded` can be set by an action.

State of implementation: partly done. The way from purchase to plant (the tab "Wunschliste", wired by the app because `wishlist`, `catalog` and `collection` do not know each other, ADR 0003): after "Gekauft" the confirmation offers "Exemplar anlegen"; the same action stands next to every bought wish that has no specimen yet, so the path is never lost. The wish name is searched in the catalog (`GET /species?q=`); a species whose Latin name equals it (ignoring case and spacing, nothing guessed, P-08) opens the creation form with that species preselected (US-BES-02). If the catalog has no such species, the catalog search opens with the wish name already typed and says so (US-BES-01 then proposes the species with that name). While the keeper is on this way a banner says that the specimen is created for the wish and offers "Verknüpfung abbrechen"; leaving the species and collection pages drops the link, so an unrelated specimen is never linked. When the specimen exists the app calls the validating operation `wish.link_specimen` (`POST /wishes/:id/specimen`, owner only, `Idempotency-Key`): only a bought wish is linked (`wish.not_bought`), a wish keeps its first specimen and a specimen belongs to one wish (`wish.already_linked`), linking the same pair again changes nothing, a wish or specimen of another account looks unknown (`wish.not_found`, `specimen.not_found`, P-04; the specimen must belong to the same account by a composite foreign key, migration 0024). The bought list then reads "Gekauft → Exemplar angelegt". If the link fails after the specimen was created, the page says so with the German text of the code and offers "Erneut verknüpfen" (the specimen stays, P-10). "Verwerfen" on every open candidate asks first, then runs the validating operation `wish.discard` (`POST /wishes/:id/discard`, owner only, `Idempotency-Key`): an open wish becomes `Discarded`, leaves the candidate list, is kept and listed in the new section "Verworfen" (`GET /wishes/discarded`, P-10); discarding again changes nothing, a bought wish is refused (`wish.already_bought`) and stays bought. Gaps: the third criterion cannot be met yet: a wish has no price or purchase date field and the cost view (US-EQU-09) does not exist, so nothing is handed over and nothing is invented (P-08; the specimen's catch date stays today unless the keeper changes it, FR-BES-04); the species link of DM-WUN-01 (`Species?`) is not stored on the wish, the specimen link carries it; there is no way back from `Discarded` (US-ENT-04) and no manual test protocol yet.

## Data model

### DM-WUN-01 Wish

`Name`, `German`, `Species?` (reference into the catalog), `Target_Light_Zone`, `Difficulty` (number 1–3), `Reasoning`, `Image`, `Image_Source`, `License`, `Type` (`Plant` | `Equipment`), `Status` (`Wishlist` | `Bought` | `Discarded`), `Specimen?` (reference after purchase), `Source` and `Decided_At` (DM-ENT-02).

New wishes also arise via yes/no in Discover (`17-Discover.md`); `Discarded` is a decision of its own there and a learning signal (US-ENT-05).

## Requirements

| ID        | Requirement                                                                                                                                                                                         | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-WUN-01 | Wishes have a fixed format per DM-WUN-01.                                                                                                                                                           | ⬜     |
| FR-WUN-02 | Only `Status = Wishlist` counts as "open".                                                                                                                                                          | ⬜     |
| FR-WUN-03 | The target zone must be a zone 2–4 of the account, otherwise the wish is not considered in counting and buffer and appears in "Hints" (P-10).                                                       | ⬜     |
| FR-WUN-04 | `Difficulty` is the same number 1–3 everywhere (solves B-05).                                                                                                                                       | ⬜     |
| FR-WUN-05 | Wishlist and Pokédex are **linked**: a wish with a species shows whether the species is still missing (new compared to the prototype, solves B-09).                                                 | ⬜     |
| FR-WUN-06 | Duplicate names are rejected on creation, regardless of letter case and diacritics ("Café" equals "Cafe"); status changes address via id. Older duplicates are shown and can be renamed or deleted. | ✅     |
| FR-WUN-07 | The wishlist is private. Visible only through sharing by the keeper; swap offers from friends that concern a wished species appear as a hint (US-SOZ-09), without disclosing the list.              | ⬜     |
