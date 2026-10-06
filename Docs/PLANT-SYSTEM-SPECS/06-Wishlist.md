# 06 – Epic WUN: Wishlist and Acquisition Planning

Goal: new plants are acquired where the lamp system has room, and the candidate list does not run empty unnoticed.

Sources: `02-Areas/Pflanzen/Wunschliste.md`, dashboard block "🛒 Nächste Anschaffungen", `Lampen-Zuordnung.md`.

## User stories

### US-WUN-01 · See candidates prioritized by space need · ✅

As a **plant keeper** I want to see purchase candidates whose target level is thinnest in the cabinet, so that I buy sensibly.

Acceptance criteria:

- The block shows candidates with `Status: "Wunschliste"`, sorted ascending by the stock of the respective `Ziel_Lampe` (specimen count, lamps 2–4; unknown level last).
- Columns: photo (max. 120 px, with source link), plant ("Deutsch (Name)"), target lamp with current stock ("— N Pflanzen"), difficulty, reasoning, action.
- If there are no open candidates: "Keine offenen Kandidaten in der Wunschliste."

### US-WUN-02 · Be warned before the list is empty · ✅

As a **plant keeper** I want a warning when too few candidates are left for a lamp level, so that I research replenishment in time.

Acceptance criteria:

- Per lamp level 2, 3, 4 there should be at least **2** open candidates (`PUFFER_MIN = 2`).
- If a level falls below that, ⚠️ "Nachschub nötig: <level> (N offene Kandidaten), …" appears at the top with a reference to the prompt template.
- The warning is the trigger for the research task to Claude (US-WUN-04); the research itself cannot be automated, only the recognition of the need.

### US-WUN-03 · Record a purchase with a click · ✅

As a **plant keeper** I want to click "Gekauft ✔", so that the status changes without YAML editing.

Acceptance criteria:

- The click sets `Status: "Gekauft"` on the entry with the matching `Name` in `Kandidaten` and disables the button.
- The candidate disappears from the list, but stays in the file.

### US-WUN-04 · Have Claude research new candidates · ✅

As a **plant keeper** I want a template with which Claude researches new candidates that fit the lamp level, so that the entries fit directly into the frontmatter.

Acceptance criteria:

- The template in `Wunschliste.md` demands target lamp, number and an exclusion list (stock and existing candidates).
- The botanical light demand must **fit** the target level, not merely tolerate it; plus a short reasoning (CAM, origin, leaf morphology).
- Image URL and image source (Commons page) are checked by HTTP request for reachability, not guessed.
- The output is exclusively a YAML list in the format of DM-04, to be inserted below the last entry.

### US-WUN-05 · Get from purchase to plant · 🟡

As a **plant keeper** I want as few manual steps as possible from purchase to specimen after buying, so that purchase and documentation do not drift apart.

Acceptance criteria (target): after "Gekauft ✔" the path to the species note and to the specimen is guided.

As-is: "Gekauft ✔" only changes the status. The note "afterwards create the species note via the prompt template" is text; there is no transition (e.g. prefilled template with the name), and `Verworfen` is only set by hand. Image URLs are external hotlinks to Wikimedia (no local copies). → Backlog B-09.

## Requirements

| ID        | Requirement                                                                                                                       | Status          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-WUN-01 | `Kandidaten` is a frontmatter array per DM-04; `Status` ∈ {`Wunschliste`, `Gekauft`, `Verworfen`}.                                | ✅              |
| FR-WUN-02 | Only `Status === "Wunschliste"` counts as "open".                                                                                 | ✅              |
| FR-WUN-03 | `Ziel_Lampe` must be one of the three strings lamp 2/3/4, otherwise the candidate is not considered in counting and buffer check. | ✅              |
| FR-WUN-04 | `Schwierigkeit` in the wishlist is text (`Einfach`/`Medium`/`Schwer`), in `Arten.md` however a number 1–3 (see B-05).             | 🟡              |
| FR-WUN-05 | The wishlist is **not** linked to the Pokédex (deliberate, out of scope in v1/v2).                                                | ✅              |
| FR-WUN-06 | The name match on "Gekauft ✔" happens via `Name`; duplicate names would change the first hit.                                     | ✅ (limitation) |
