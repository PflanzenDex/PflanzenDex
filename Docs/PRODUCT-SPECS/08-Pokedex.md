# 08 – Epic POK: Plant Pokédex

Goal: collecting is fun and draws the eye to new species. The collection unit is the **species** (order → family → genus → species). The card always shows name and text (for targeted keeping an eye out, no masking); caught is colored with the own photo.

Prototype reference: epic POK (`../PLANT-SYSTEM-SPECS/07-Pokedex.md`), the most mature in the prototype (66 + 73 tests). The logic (cards, milestones, rank, search) and the build script for the taxonomy tree are candidates for reuse (E-01).

Note: in the prototype the stories POK-04 (hook) and POK-05 (robustness) were part of the build. They are absorbed into US-POK-03 here.

## User stories

### US-POK-01 · See collector cards for species · ⬜ (prototype ✅)

Acceptance criteria:

- Card: number `#NNN` (consecutive in tree order), species name, short German name (addition in parentheses cut off, full name as tooltip), short text, "Genus: N species", difficulty (★☆☆ … ★★★), light zone.
- **Caught:** colored; photo = latest measurement photo of an active specimen, otherwise Wikipedia image; chip "caught DD.MM.YYYY" (or "≈ …" or "date unknown"); "N specimens" only for N > 1.
- **Missing:** name, German name and short text **visible**; photo = Wikipedia image; chip "not caught yet".
- Without image: icon matching the family (cactus, arum, tendril leaf, orchid, rosette, bulb flower, sword leaves, palm, fern, bromeliad; otherwise neutral sprout).
- If the short text is missing: "No description available."
- Species-poor (genus ≤ 10 species according to GBIF): badge "Species-poor"; caught species-poor species with a rarity frame.
- Source link on every card with an image source (CC BY-SA).

### US-POK-02 · Maintain the catalog · ⬜ (prototype ✅)

As an **operator** I want to maintain the species catalog in one place; as a **plant keeper** to propose species.

Acceptance criteria:

- A catalog entry has `Name` (genus + epithet), `German`, `Difficulty` (1–3), `Light_Zone` (2–4), optional `Note`. Required fields are validated.
- Names are normalized (`ficus BENJAMINA` → `Ficus benjamina`), duplicates are dropped, invalid ratings trigger a warning, hybrid signs and cultivar additions do not belong in the catalog (US-POK-06).
- The catalog grows in batches (target size 600+ species; collector genera with 10–20 species, otherwise 1–3 per genus); each batch is proofread and usable without a "finished" catalog (prototype 🟡: 215 species).
- User proposals (US-BES-01) land in the operator's review list (US-BES-10) and count only after approval.

### US-POK-03 · Build taxonomy and enrichment automatically · ⬜ (prototype ✅)

As the **system** I want to generate the tree, including Wikipedia data and genus species count, from the catalog.

Acceptance criteria:

- Resolution per species via OpenTree TNRS (land plants, rank species; synonym hits filtered) to order, family, genus.
- Enrichment: Wikidata (rank species) → Wikipedia summary (de; fallback en, text and image then English). Short text at most 2 sentences and 240 characters at a sentence boundary. GBIF species count per genus once (0 = unknown).
- Every species that cannot be resolved is in an error list with a reason, never silently dropped. Renamed genera (_Sansevieria_ → _Dracaena_) are kept under the current name.
- When the catalog changes, the build runs automatically in the background; without a change nothing runs.
- Robust: on a network failure the previous good tree is kept (atomic replacement); individual errors are reported, not cached; "no article/GBIF hit" is cached as a result; requests are throttled and repeated on 429/5xx (at most 5×, backoff ≤ 60 s).
- Idempotent: same inputs and caches yield identical output.
- The operator sees a warning when catalog and tree differ in the names.

### US-POK-06 · Derive ownership automatically from my plants · 🟨 (prototype ✅)

Acceptance criteria:

- Species = first two "words" of the Latin name (hybrid sign skipped, epithet lowercase): `Citrus x limon` → `Citrus limon`.
- Additions (`var.`, `subsp.`, `f.`, `'Cultivar'`) do not flow into the assignment but appear as a chip on the card (`Opuntia microdasys var. albispina` → species `Opuntia microdasys`, chip `var. albispina`).
- Caught = at least one **active** specimen of the keeper refers to the species. Archived does not count.
- If the epithet is missing (e.g. `Hippeastrum`, `Parodia sp.`), the specimen does not count as caught; the app points this out ("Identify the species, then it counts").

### US-POK-07 · Catch date and photo honest · 🟨 (prototype ✅)

Acceptance criteria:

- Catch date per species = earliest across all active and archived specimens of the keeper. Source per specimen in this order: `Caught_At` (today's local date on creation, or the date the keeper back-dated or corrected later, FR-BES-04, US-BES-11) → creation date of the specimen (display "≈") → "unknown". **Never guessed.**
- Photo = latest measurement with a photo across all specimens, otherwise Wikipedia image.

### US-POK-08 · Search, filter, sort · 🟨 (prototype ✅)

Acceptance criteria:

- Search (case-insensitive) across species name, German name, genus, family, order.
- Filters: All · Caught · Missing · Species-poor.
- Sorting: by family (grouped, collapsible with `n / m`), alphabetical, catch date (caught first, newest first, without date after, missing last), species count (ascending, unknown last). Except "Family" a flat grid.
- No hits: "No species found."

### US-POK-09 · View details of a species · 🟨 (prototype ✅)

Acceptance criteria:

- A tap opens the card or a detail view: larger image, full German name, full short text, genus, catch status, specimen count, cultivar chips, source link, and the link to the species profile.
- At most one detail view open; closing is unambiguous (button, Escape and the browser's Back button; the list keeps its place and the collapsed family groups).
- For Missing: actions "to the wishlist" (US-WUN, `Source: Pokédex`; counts as yes for Discover, US-ENT-05) and, if a friend has it, "Friend has it" (US-SOZ-07).

Status 🟨: the detail view of caught species is implemented (German name, genus, family, status, specimen count, cultivar chips, catch date, the catalog's source field as link, link to the species profile). Missing: the larger image and the full short text (taxonomy build, US-POK-03; shown as "no image" and "unknown"), the Missing cards and their two actions (no species list of the tree, no wishlist US-WUN, no friends US-SOZ).

### US-POK-10 · Collector rank and progress · ⬜ (prototype ✅)

Acceptance criteria:

- Rank by number of caught species: Seedling 0–4, Sapling from 5, Young plant from 15, Bloomer from 30, Treetop from 60, Botanist from 100.
- Display: rank, "N / M species caught (P %)", progress bar, "N more until "<next rank>"", "k of K orders discovered" (K from the tree, not hard-coded), state of the tree.

### US-POK-11 · Milestones with an instruction for action · 🟨 (prototype ✅)

Acceptance criteria:

- Family: _discovered_ (≥ 1 species), _connoisseur_ (family has ≥ 3 species; target = rounded-up half), _complete_ (family has ≥ 2 species; target = all).
- Genus: _discovered_, _complete_ (≥ 2 curated species); no "connoisseur".
- _Explorer_: orders with ≥ 1 caught species; `missing` = orders with the fewest species first.
- Groups "Without family/genus/order" have no milestones.
- Each milestone has `current`, `target`, `remaining` and up to 3 `missing` (German + Latin).
- Display: up to 4 open milestones with the smallest remainder > 0 (tie: higher ratio first, then title), "N more: …" with bar; collapsed "N milestones reached" with date (catch date of the nth species), if known.

Status 🟨: the logic and the view work over a taxonomy tree. Missing: the tree (taxonomy build, US-POK-03); until then the view says milestones need the tree and shows none (nothing is invented, P-08).

### US-POK-12 · "Newly caught" on the next visit · ⬜ (prototype ✅)

Acceptance criteria:

- The "seen" state is stored per account on the server (not in the browser). `new` = caught species − `seen`.
- On the first visit (or with a missing state): silent creation with the current state, **no** banner.
- The banner "Newly caught: …" stays until "Okay", which writes `seen`.
- Read errors do not break the page; no banner appears then.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                    | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-POK-01 | Pure logic (cards, milestones, search, ownership, rank) without I/O and with tests; the prototype tests (`pokedex-core.js`, 66) are the starting point.                                                                                                        | ⬜     |
| FR-POK-03 | The taxonomy tree is written only by the build job, never by hand.                                                                                                                                                                                             | ⬜     |
| FR-POK-04 | Hints for operator and keeper: own species not in the catalog; species that cannot be resolved; name deviation catalog ↔ tree; rating missing/invalid; specimen without epithet; "N species without a Wikipedia article" and "N without a GBIF species count". | ⬜     |
| FR-POK-05 | The species-poor threshold (10) refers to the **genus**; species-poor is a badge, not a milestone.                                                                                                                                                             | ⬜     |
| FR-POK-06 | Card numbers are consecutive in the current tree order. New species shift the numbers; "stable" applies only with an unchanged list.                                                                                                                           | ⬜     |
| FR-POK-07 | Wikipedia text is under CC BY-SA; every card links the source.                                                                                                                                                                                                 | ⬜     |
| FR-POK-08 | No invented numbers: species count from GBIF, catch date from own data, "unknown" instead of guessing.                                                                                                                                                         | ⬜     |
| FR-POK-09 | Cultivars get no catalog slot of their own (no taxonomy/enrichment possible).                                                                                                                                                                                  | ⬜     |
| FR-POK-10 | The family icon assignment is configuration, no code in the interface.                                                                                                                                                                                         | ⬜     |
| FR-POK-11 | **Social:** the keeper's Pokédex is the basis for friend comparison ("you have it / you lack it", US-SOZ-07). Rank and leaderboard comparison between friends remain excluded.                                                                                 | ⬜     |
| FR-POK-12 | Wishlist and Pokédex are linked (FR-WUN-05); deliberately not in the prototype.                                                                                                                                                                                | ⬜     |
