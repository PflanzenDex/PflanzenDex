# 07 – Epic POK: Plant Pokédex

Goal: collecting is fun and draws the eye to new species. The collection unit is the **species** (order → family → genus → species). The card always shows name and text (for targeted keeping an eye out, no Pokémon-style masking), caught is colored with the own photo.

Sources: `03-Resources/Pflanzen-Pokedex/Pflanzen-Pokedex.md`, `scripts/pflanzen/{build_pokedex.py,pokedex-core.js,pokedex.css}`, hook, tests, specs v1/v2/v3 (`docs/superpowers/specs/`), `CLAUDE.md`. If specs and code contradict each other, the code applies; see B-03.

## User stories

### US-POK-01 · See collector cards for species · ✅

As a **plant keeper** I want to see every species as a collector card, so that I grasp stock and gaps at a glance.

Acceptance criteria:

- Each card shows number `#NNN` (consecutive in tree order), species name, short German name (addition in parentheses cut off, full name as tooltip), short text, `🧬 Gattung: N Arten`, difficulty (★☆☆ … ★★★) and `☀ L<lamp>`.
- **Caught:** colored; photo = `Foto` of the latest growth log entry of a specimen, otherwise the Wikipedia image; chip "gefangen DD.MM.YYYY" (or "≈ …" or "Datum unbekannt"); "N Exemplare" only for N > 1; line "Gattung: <genus>".
- **Missing:** name, German name and short text **visible**; photo = Wikipedia image (not the own); chip "noch nicht gefangen"; "???" as a placeholder at the top right.
- If the species has neither an own nor a Wikipedia image, the card shows an icon matching the family (cactus, arum, tendril leaf, orchid, rosette, bulb flower, sword leaves, palm, fern, bromeliad; all others the neutral sprout).
- If the short text is missing: "Keine Wikipedia-Beschreibung verfügbar."
- If the genus is species-poor (≤ 10 species according to GBIF): badge "✨ Artenarm"; caught species-poor species additionally with a rarity frame.
- Source link "Wikipedia" (CC BY-SA attribution) on every card with an image source.

### US-POK-02 · Curate the catalog · ✅

As a **plant keeper** and **Claude** we want to maintain the catalog via a single file.

Acceptance criteria:

- `Arten.md` has a frontmatter array `Arten` with `Name`, `Deutsch`, `Schwierigkeit` (1–3), `Lampe` (2–4), optional `Notiz`.
- `Name` needs genus **and** epithet; single-word entries are not taken over by the script but reported as invalid.
- Names are normalized ("genus" capitalized, epithet lowercase): `ficus BENJAMINA` → `Ficus benjamina`; duplicates are dropped.
- Invalid ratings (outside 1–3 / 2–4) count as missing and trigger a warning.
- A hybrid sign (`×`, `x`) is skipped; cultivar additions do not belong in the catalog (see US-POK-06).

### US-POK-03 · Build the taxonomy tree and enrichment automatically · ✅

As the **system** I want to generate the tree, including Wikipedia data and genus species count, from `Arten.md`.

Acceptance criteria (`python3 scripts/pflanzen/build_pokedex.py [--offline]`):

- Resolution per species via OpenTree TNRS (`context_name: "Land plants"`, rank species; synonym hits are filtered, a pure synonym hit lands in `fehler`, not as a double leaf) to order, family, genus.
- Enrichment: Wikidata (SPARQL, rank species `Q7432`) → Wikipedia REST summary (de; fallback en if there is no German article, text and image then English). `disambiguation` counts as "no article". Short text shortened to at most 2 sentences and 240 characters at a sentence boundary.
- Per genus once (deduplicated) the GBIF species count (`arten_anzahl_gattung`; 0 counts as unknown).
- Output `Pokedex-Baum.json` with `hinweis`, `stand`, `ordnungen`, `fehler`. Sorting stable; order/family/genus without assignment land under "Ohne Ordnung"/"Ohne Familie".
- Every species that cannot be resolved is in `fehler` with a reason, never silently dropped.
- Renamed genera (e.g. _Sansevieria_ → _Dracaena_, _Saintpaulia_ → _Streptocarpus_) are deliberately kept under the current name.

### US-POK-04 · Rebuild the tree automatically when the catalog changes · ✅

As a **plant keeper** I want to trigger nothing manually after changing `Arten.md`.

Acceptance criteria:

- The `post-commit` hook starts `build_pokedex.py` in the background (`nohup`) if `03-Resources/Pflanzen-Pokedex/Arten.md` was changed in the commit; output in `scripts/pflanzen/pokedex_last_run.log`.
- Without a change to `Arten.md` nothing runs. Manual start possible at any time.
- The dashboard shows a warning when the names in `Arten.md` and in the tree differ (name comparison, no file date) and names the command.

### US-POK-05 · Robust against network failure and rate limits · ✅

As the **system** I want to never overwrite the good tree with partial results.

Acceptance criteria:

- On a network failure or a missing cache entry the script ends with exit code 2 and leaves `Pokedex-Baum.json` untouched.
- Writing is atomic (temporary file, `os.replace`).
- Errors of individual species are reported and **not** cached; "no article" or "no GBIF hit" are cached as `null` so that reruns are fast.
- HTTP is throttled and repeated up to 5 times on 429/500/502/503/504 (Retry-After or exponential backoff, at most 60 s). Client identifier: `vault-pokedex/0.1 (personal)`, timeout 30 s.
- `--offline` uses only the caches (`.pokedex_cache.json`, `.pokedex_enrich_cache.json`).
- Cached entries are refreshed by deleting the entry in the cache and restarting.
- Idempotency: same inputs and same cache yield a byte-identical `Pokedex-Baum.json` (`stand` changes only when the tree changes).

### US-POK-06 · Derive ownership automatically from my plants · ✅

As a **plant keeper** I want a species to count as caught as soon as I own a specimen, without maintaining an ownership field.

Acceptance criteria:

- Species name = first two "words" (genus + epithet) of `Lateinischer_Name` of the linked species note (hybrid sign skipped, epithet lowercase): `Citrus x limon` → `Citrus limon`.
- Additions (`var.`, `subsp.`, `f.`, `'Cultivar'`) do not flow into the assignment but appear as a chip on the own card; with several specimens all cultivars, deduplicated (`Opuntia microdasys var. albispina` → species `Opuntia microdasys`, chip `var. albispina`).
- Caught means: at least one specimen in `Meine Pflanzen/` refers to the species. Archived does not count.
- If the species epithet is missing (e.g. `Hippeastrum`, `Parodia sp.`), the plant does not count as caught; the dashboard warns "Eigene Pflanzen ohne Artepitheton … Art-Notiz ergänzen".

### US-POK-07 · Catch date and photo correct and honest · ✅

As a **plant keeper** I want a verifiable catch date and my own photo on the card.

Acceptance criteria:

- Catch date per species = earliest across all specimens. Source per specimen in this order: `Gefangen_Am` → `created` of the specimen → `created` of the species note (display "≈", because note creation instead of acquisition) → "unknown". **Never guessed.**
- Photo = `Foto` of the latest growth log entry (by `Datum`) across all specimens that carry one; otherwise Wikipedia image.
- The photo display runs via `app.vault.adapter.getResourcePath`.

### US-POK-08 · Search, filter, sort · ✅

As a **plant keeper** I want to find specifically what I am looking for in the catalog.

Acceptance criteria:

- Search field (case-insensitive) across species name, short German name, genus, family, order.
- Filter chips: Alle · Gefangen · Fehlend · Artenarm.
- Sorting: **By family** (grouped in collapsible family blocks with `n / m` and order name, open by default), **alphabetical**, **catch date** (caught first, newest first, without date after, missing last), **species count** (ascending by genus species count, unknown last). For every sorting except "Family" the grouping is dropped in favor of a flat grid.
- No hits: "Keine Art gefunden."

### US-POK-09 · View details of a species · ✅

As a **plant keeper** I want to expand a card with a click and read all values.

Acceptance criteria:

- A click expands the card **inline** (no `position: fixed`, because that is unreliable in Obsidian notes due to transformed scroll containers): larger image, full German name, full short text, genus line, catch status, specimen count, cultivar chip, Wikipedia link.
- At most one card is open; "✕" closes; a click on the Wikipedia link does not close the card.

### US-POK-10 · Collector rank and progress · ✅

As a **plant keeper** I want to see my rank and progress, so that it feels like progress.

Acceptance criteria:

- Rank by number of caught species: Keimling (seedling) 0–4, Setzling (sapling) from 5, Jungpflanze (young plant) from 15, Blüher (bloomer) from 30, Baumkrone (treetop) from 60, Botaniker (botanist) from 100.
- Display: rank, "N / M Arten gefangen (P %)", progress bar, "Noch N bis „<next rank>"", "k von K Ordnungen entdeckt", state of the tree. K counts the orders in the tree (without "Ohne Ordnung"), not hard-coded.

### US-POK-11 · Milestones with an instruction for action · ✅

As a **plant keeper** I want to see goals that name what exactly is still missing.

Acceptance criteria:

- Family: _discovered_ (≥ 1 species), _connoisseur_ (family has ≥ 3 species; target = rounded-up half), _complete_ (family has ≥ 2 species; target = all).
- Genus: _discovered_ (≥ 1 species), _complete_ (genus has ≥ 2 curated species); no "connoisseur" at genus level.
- _Explorer_: orders with ≥ 1 caught species out of all; `fehlend` = orders with the fewest species first.
- Groups "Ohne Familie", "Ohne Gattung", "Ohne Ordnung" have no milestones of their own.
- Each milestone has `aktuell`, `ziel`, `rest` and up to 3 `fehlend` (German name and Latin name).
- Display: up to 4 open milestones with the smallest remainder > 0 (on a tie higher ratio first, then title), "noch N: …" with progress bar; collapsed "🏆 N Meilensteine erreicht" with date (catch date of the nth species), if known.

### US-POK-12 · "Newly caught" on the next visit · ✅

As a **plant keeper** I want to see what has been added since my last visit.

Acceptance criteria:

- State in `03-Resources/Pflanzen-Pokedex/.pokedex-state.json` (`{gesehen: [...], stand}`, gitignored), read/written via `app.vault.adapter`.
- `neu` = caught species − `gesehen`. If the file is missing or broken: silent creation with the current state, **no** banner.
- The banner "🎉 Neu gefangen: …" stays until the click on "Okay ✔" (writes `gesehen`).
- Read/write errors are caught; the dashboard then renders without a banner instead of breaking.

### US-POK-13 · Expand the catalog to 600+ species · 🟡

As a **plant keeper** I want a large catalog with many species per collector genus (Hoya, Euphorbia, Echeveria, Crassula, Opuntia, Peperomia, Ficus, Begonia, Philodendron, Aloe, Rhipsalis, Sedum, Haworthia), so that there is something to collect.

Acceptance criteria:

- The catalog grows in idempotent batches (extend `Arten.md`, commit, the hook builds the tree); a batch is usable without the catalog having to be "finished".
- Target size 600+ species; collector genera with 10–20 species, otherwise 1–3 per genus.
- The user proofreads every batch.

As-is: 215 species (tree as of 2026-09-29), 0 errors. The expansion is pure curation work, not a code topic. → Backlog B-10.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                          | Status          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-POK-01 | Pure logic (cards, milestones, search, ownership, rank) is in `pokedex-core.js` without the Obsidian API and tested with `node --test` (66 tests).                                                                                                   | ✅              |
| FR-POK-02 | Appearance is in `pokedex.css`; after changes to `.js`/`.css` reload the note (Dataview observes only the note itself).                                                                                                                              | ✅              |
| FR-POK-03 | `Pokedex-Baum.json` is written only by the script, never manually.                                                                                                                                                                                   | ✅              |
| FR-POK-04 | Drift/gap warnings in the dashboard: own species not in `Arten.md`; unresolvable species (`fehler`); name deviation list ↔ tree; rating missing/invalid; species without epithet; info "N Arten ohne Wikipedia-Artikel" and "N ohne GBIF-Artenzahl". | ✅              |
| FR-POK-05 | The species-poor threshold `ARTENARM_MAX = 10` refers to the **genus**; species-poor is a badge, not a milestone.                                                                                                                                    | ✅              |
| FR-POK-06 | Card numbers are consecutive in the current tree order. New species shift the numbers of following cards; "stable" applies only with an unchanged list.                                                                                              | ✅ (limitation) |
| FR-POK-07 | Wikipedia text is under CC BY-SA; every card links the source.                                                                                                                                                                                       | ✅              |
| FR-POK-08 | No invented numbers: species count from GBIF, catch date from own data, "unknown" instead of guessing.                                                                                                                                               | ✅              |
| FR-POK-09 | Cultivars get no catalog slot of their own (no botanical taxonomy/enrichment possible).                                                                                                                                                              | ✅              |
| FR-POK-10 | The family icon assignment is in `FAMILY_ICON_KEY` (`pokedex-core.js`).                                                                                                                                                                              | ✅              |
| FR-POK-11 | Out of scope: SVG tree, linking with the wishlist, IUCN status, sound/animations beyond CSS. Social comparisons (friends' collection, "fehlt dir") belong to epic SOZ (US-SOZ-07), not in the Pokédex code.                                          | ✅ (deliberate) |
| FR-POK-12 | `Arten.md` and `Wunschliste.md` (candidates) share no data, even if species overlap (e.g. `Philodendron hederaceum`, `Aglaonema commutatum`).                                                                                                        | 🟡 (B-09)       |
