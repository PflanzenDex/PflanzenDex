# 08 – Epic POK: Plant Pokédex

Goal: collecting is fun and draws the eye to new species. The collection unit is the **species** (order → family → genus → species). The card always shows name and text (for targeted keeping an eye out, no masking); caught is colored with the own photo.

Prototype reference: epic POK (`../prototype/07-pokedex.md`), the most mature in the prototype (66 + 73 tests). The logic (cards, milestones, rank, search) and the build script for the taxonomy tree are candidates for reuse (E-01).

Note: in the prototype the stories POK-04 (hook) and POK-05 (robustness) were part of the build. They are absorbed into US-POK-03 here.

Note (US-QS-14): the Pokédex is shown as the view "Arten" of the destination "Sammlung", next to the views "Pflanzen" of the collection epic (BES) and "Wunschliste" of the wishlist epic (WUN); the action "to the wishlist" of a missing species (US-POK-09) opens the wishlist view.

## User stories

### US-POK-01 · See collector cards for species · 🟨 (prototype ✅)

Acceptance criteria:

- Card: number `#NNN` (consecutive in tree order), species name, short German name (addition in parentheses cut off, full name as tooltip), short text, "Genus: N species", difficulty (★☆☆ … ★★★), light zone.
- **Caught:** colored; photo = latest measurement photo of an active specimen, otherwise Wikipedia image; chip "caught DD.MM.YYYY" (or "≈ …" or "date unknown"); "N specimens" only for N > 1.
- **Missing:** name, German name and short text **visible**; photo = Wikipedia image; chip "not caught yet".
- Without image: icon matching the family (cactus, arum, tendril leaf, orchid, rosette, bulb flower, sword leaves, palm, fern, bromeliad; otherwise neutral sprout).
- If the short text is missing: "No description available."
- Species-poor (genus ≤ 10 species according to GBIF): badge "Species-poor"; caught species-poor species with a rarity frame.
- Source link on every card with an image source (CC BY-SA).

Status 🟨: the cards of the taxonomy tree work (`GET /pokedex/cards`, caught derived live from the specimens, missing cards, species-poor badge and rarity frame, Wikipedia image as a link only, P-05). Missing: the latest measurement photo of an active specimen (WAC-05, storage TE-05; the Wikipedia image link or a neutral sprout is shown) and the family icons (FR-POK-10); caught species that are not in the tree are not shown as cards (FR-POK-04 hints).

### US-POK-02 · Maintain the catalog · 🟨 (prototype ✅)

As an **operator** I want to maintain the species catalog in one place; as a **plant keeper** to propose species.

Acceptance criteria:

- A catalog entry has `Name` (genus + epithet), `German`, `Difficulty` (1–3), `Light_Zone` (2–4), optional `Note`. Required fields are validated. Difficulty and light zone may be "unbekannt" when no source gives them; they are never filled with a starting value (P-08, DM-BES-01, #1003).
- Names are normalized (`ficus BENJAMINA` → `Ficus benjamina`), duplicates are dropped, invalid ratings trigger a warning, a hybrid sign (`x`, `×`, `+`) or an addition (`var.`, `subsp.`, `ssp.`, `f.`, `cv.`) is refused in a catalog name (these belong to the specimen, US-POK-06), while a cultivar in quotation marks (`Ficus elastica 'Robusta'`) is accepted (DM-BES-01) and shown as a chip (US-POK-06); it does not change the species assignment of the Pokédex.
- The catalog grows in batches (target size 600+ species; collector genera with 10–20 species, otherwise 1–3 per genus); each batch is proofread and usable without a "finished" catalog (prototype 🟡: 215 species).
- User proposals (US-BES-01) land in the operator's review list (US-BES-10) and count only after approval.

Status 🟨: the entry fields with limits (difficulty 1–3, light level 2–4), the normalization (`ficus BENJAMINA` → `Ficus benjamina`), the duplicate check (name and synonyms) and the proposal path into the review list (US-BES-01, US-BES-10; a proposal counts only after approval) work. A hybrid sign (`x`, `X`, `×`, `+`) or an addition (`var.`, `subsp.`, `ssp.`, `f.`, `cv.`) is refused on the Latin name with the codes `catalog.name_hybrid` and `catalog.name_addition`; a cultivar in quotation marks stays accepted (owner decision 2026-10-07). Missing: the growth to 600+ species in proofread batches (TE-12, data work, not part of this story) and an operator path to change an approved entry.

### US-POK-03 · Build taxonomy and enrichment automatically · 🟨 (prototype ✅)

As the **system** I want to generate the tree, including Wikipedia data and genus species count, from the catalog.

Acceptance criteria:

- Resolution per species via OpenTree TNRS (land plants, rank species; synonym hits filtered) to order, family, genus.
- Enrichment: Wikidata (rank species) → Wikipedia summary (de; fallback en, text and image then English). Short text at most 2 sentences and 240 characters at a sentence boundary. GBIF species count per genus once (0 = unknown).
- Every species that cannot be resolved is in an error list with a reason, never silently dropped. Renamed genera (_Sansevieria_ → _Dracaena_) are kept under the current name.
- When the catalog changes, the build runs automatically in the background; without a change nothing runs.
- Robust: on a network failure the previous good tree is kept (atomic replacement); individual errors are reported, not cached; "no article/GBIF hit" is cached as a result; requests are throttled and repeated on 429/5xx (at most 5×, backoff ≤ 60 s).
- Idempotent: same inputs and caches yield identical output.
- The operator sees a warning when catalog and tree differ in the names.

Status 🟨: the build job (`pokedex.build_taxonomy`) resolves lineage (OpenTree, land plants, rank species; a synonym hit such as _Sansevieria_ → _Dracaena_ is kept under the current name, approximate hits are errors), takes the Wikipedia summary (de, else en) only when Wikidata confirms rank species, shortens the text to 2 sentences and 240 characters at a sentence boundary (a longer first sentence leaves the text unknown), reads the GBIF species count per genus once (0 = unknown) and replaces the table `taxon` in one transaction; unresolved species are rows with a reason code (`taxonomy.*`). A source failure stops the build and keeps the previous tree (the job is retried by the queue). The job is ordered when the fingerprint of the catalog names differs from the stored tree. Missing: the operator warning for name differences, and the lease renewal for builds longer than 5 minutes (see `README.md` status line).

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

### US-POK-12 · "Newly caught" on the next visit · 🟨 (prototype ✅)

Acceptance criteria:

- The "seen" state is stored per account on the server (not in the browser). `new` = caught species − `seen`.
- On the first visit (or with a missing state): silent creation with the current state, **no** banner.
- The banner "Newly caught: …" stays until "Okay", which writes `seen`.
- Read errors do not break the page; no banner appears then.

### US-POK-13 · Rarity of a species in nature · 🟨 (new)

As a **keeper** I want to see how rare a species is in the wild, with the source, so that I can value what I keep without being steered to buy it.

This is the first of two separate statements about rarity. The second, "rarity in PflanzenDex", is a story of its own (US-POK-14); the two are never merged into one number or one label.

Acceptance criteria:

- Given a species of the taxonomy tree, when the build job enriches it, then it stores up to two values with their source, source URL and retrieval date: the **IUCN Red List category** (LC, NT, VU, EN, CR, EW, EX, DD) and the **number of GBIF occurrence records** of the species (assumption, decided by the PO: GBIF as the source of both, because it needs no key or account).
- Given a value that no source gave (no GBIF match, no assessment, a category outside that list, an occurrence count of 0), then it is stored as unknown (NULL) and shown as "unbekannt"; nothing is estimated and no category is derived from other data (P-08).
- Given a species name that GBIF matches only approximately or only at another rank, then no value is taken (exact species match only).
- Given a source failure, then the build fails as a whole and keeps the previous tree (P-10, as US-POK-03); "no hit" is cached as a result.
- Given a collector card, then the card shows "In der Natur: <category>" and "In der Natur: N Fundmeldungen (GBIF)" with the retrieval date, each with a link to its source; the label always says "in der Natur" (assumption, decided by the PO).
- Given a species with the category VU, EN, CR or EW, then the card shows a neutral note that the species is threatened in the wild (informs, never blocks and never promotes buying).
- Given any list, ranking or view, then rarity is **not** a sort key, filter, badge, ranking or reward; the achievements (ACH) do not use it as a criterion and the recommendations (EQU) do not use it (assumption, decided by the PO).

Status 🟨: the build job stores the IUCN category and the GBIF occurrence count of the accepted species name with source and retrieval date (migration 0066), and the collector card shows them with the note. Missing: the CITES appendix, and a refresh without a catalog change (values are retrieved with each taxonomy build, which runs when the catalog changes).

Operator tasks: (1) CITES appendix only with a CITES Species+ API token, because Wikidata does not carry the appendix; until the operator provides one the card says nothing about CITES, which does not mean "not listed". (2) IUCN categories and GBIF counts are shown with the source named; check the terms of use (E-12).

### US-POK-14 · Rarity of a species in PflanzenDex · 🟨 (new)

As a **keeper** I want to see how many of the participating accounts keep a species, with the basis shown, so that I can tell how common it is in this community.

This is the second statement about rarity, kept apart from "in nature" (US-POK-13): the card labels it "in PflanzenDex" and never merges the two.

Acceptance criteria:

- Given the global setting "Include my collection in the rarity of PflanzenDex" in the account settings (US-ACC-02), then it is **off** until the keeper switches it on (default decided by the PO); the setting is saved through `account.update_profile` (`null` or left out keeps the stored value) and applies to the keeper's whole account, not to single plants.
- Given a species, then its rarity in PflanzenDex is the share of **participating accounts** (setting on) that own the species with at least one **active** specimen: per account, not per specimen; archived specimens do not count; a cultivar counts for its species (same species key as US-POK-06). It is derived live on each read and never stored (P-01).
- Given the share, then the card always shows its basis, honestly rounded, for example "In PflanzenDex: 40 % (2 von 5 Konten)"; a share that is above 0 but rounds to 0 reads "weniger als 1 %", one below 100 that rounds to 100 reads "mehr als 99 %".
- Given no participating account, then the card says "In PflanzenDex: unbekannt" (P-08).
- Given a non-participating account, then its specimens never enter the share, and no response names an account or lists who owns a species; only the two counts leave the database (P-04, P-05).
- Given the keeper switches the setting off, then the account no longer counts from the next read on.
- Given any list or view, then this rarity is **not** a sort key, filter, badge, ranking or reward either; the achievements (ACH) do not use it, the recommendations (EQU) do not use it, and it is no purchase incentive (decided by the PO).
- No minimum number of accounts applies (decided by the PO, responsibility with the operator): with few participants a share can allow conclusions about single accounts. The interface therefore always shows the basis ("2 von 5 Konten") instead of hiding small numbers.

Operator task: the privacy policy must name the evaluation (counts of accounts that own a species, only for accounts that opted in) before the setting is offered to users (E-12).

Status 🟨: setting, aggregation (database function that returns only counts), and the card line are implemented. Missing: the species detail view of caught species (US-POK-09) does not show it yet.

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
