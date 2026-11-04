# Test log: NFR-12 load measurement with 100 and 1,000 specimens (issue #586)

**Branch:** `chore/issue-586-performance-load-test-with`
**Environment:** local workstation (Linux, AMD Ryzen 5 3600, 6 cores / 12 threads, 16 GB RAM), Node v24.21.0; PostgreSQL 16.15 in a Docker container (`postgres:16-alpine`, default settings, `shared_buffers` 128 MB, loopback port); date 2026-10-08. The API runs in the same process as the script (Hono `app.request`, no network, no TLS, no compression), against the real schema as the non-superuser owner role (row-level security active, as in production).
**Method:** `app/packages/api/perf/` (`npm run perf:measure -w @pflanzendex/api`, not part of `make ci`). A fresh database is migrated, a shared catalog of 500 resolved taxa (50 genera x 10 species) is inserted, then one account per size is seeded through the real write routes: 4 light zones, 8 locations (one of them outdoor), 60 own species, N specimens (every 10th without a location, every one with a marker), 2 measurements per specimen (60 and 20 days old) and 10 wishes. After seeding `analyze` runs. Per request: 3 warm-up calls, then 30 timed calls (median and p95, nearest rank), then one extra call during which every SQL statement is counted (wrappers around `pool.query` and the clients handed out by `pool.connect`). "SQL stmts" is the total, "payload" excludes the transaction frame of `withAccount` (`begin`, `set local role`, `set_config`, `commit`; 4 per transaction). The 100 account is measured first, the 1,000 account second in the same database (the 100 account's rows stay in the tables). The app UI is German; screen names are quoted as in the UI.

Legend: times in ms, body in KB (uncompressed JSON).

---

## 1. Result: 100 vs 1,000 specimens (60 species, 30 runs)

| Screen     | Request                                       | 100: median / p95 | 1,000: median / p95 | Time x | SQL stmts (payload) at 100 | SQL stmts (payload) at 1,000 | Body KB at 100 | Body KB at 1,000 |
| ---------- | --------------------------------------------- | ----------------- | ------------------- | ------ | -------------------------- | ---------------------------- | -------------- | ---------------- |
| Heute      | `GET /today?timeZone=…`                       | 71.8 / 78.1       | 78.1 / 88.6         | 1.1    | 642 (130)                  | 642 (130)                    | 3.3            | 32.7             |
| Heute      | `GET /specimens/hints`                        | 36.0 / 43.3       | 40.1 / 44.8         | 1.1    | 316 (64)                   | 316 (64)                     | 2.6            | 26.0             |
| Sammlung   | `GET /specimens/cards?timeZone=…`             | 38.3 / 43.0       | 51.2 / 60.8         | 1.3    | 336 (68)                   | 336 (68)                     | 33.1           | 335.2            |
| Sammlung   | `GET /specimens`                              | 3.4 / 4.5         | 13.9 / 20.8         | 4.0    | 17 (5)                     | 17 (5)                       | 34.2           | 344.9            |
| Sammlung   | `GET /specimens/count`                        | 1.5 / 1.5         | 2.0 / 2.8           | 1.4    | 11 (3)                     | 11 (3)                       | 0.0            | 0.0              |
| Sammlung   | `GET /specimens/distribution`                 | 37.4 / 39.8       | 43.6 / 46.9         | 1.2    | 326 (66)                   | 326 (66)                     | 0.7            | 0.7              |
| Sammlung   | `GET /specimens/light-overview`               | 34.1 / 40.7       | 41.0 / 46.9         | 1.2    | 316 (64)                   | 316 (64)                     | 17.3           | 17.3             |
| Sammlung   | `GET /specimens/difficulty`                   | 31.3 / 35.0       | 41.8 / 45.8         | 1.3    | 316 (64)                   | 316 (64)                     | 20.3           | 20.4             |
| Entdecken  | `GET /discover/suggestions?timeZone=…&deck=1` | 42.8 / 47.7       | 50.3 / 57.3         | 1.2    | 333 (69)                   | 333 (69)                     | 3.5            | 3.5              |
| Entdecken  | `GET /pokedex/cards?timeZone=…`               | 51.5 / 94.8       | 50.4 / 55.4         | 1.0    | 318 (66)                   | 318 (66)                     | 153.5          | 153.5            |
| Entdecken  | `GET /pokedex/ownership?timeZone=…`           | 77.2 / 106.6      | 43.4 / 49.8         | 0.6    | 311 (63)                   | 311 (63)                     | 17.9           | 18.1             |
| Entdecken  | `GET /wishes/candidates`                      | 31.6 / 36.4       | 39.0 / 44.2         | 1.2    | 336 (68)                   | 336 (68)                     | 4.8            | 4.8              |
| Artenliste | `GET /species?q=`                             | 11.8 / 16.4       | 10.1 / 16.3         | 0.9    | 17 (5)                     | 17 (5)                       | 33.4           | 33.5             |

Seeding took 4.8 s for 100 and 33.9 s for 1,000 specimens (about 3 write requests per specimen).

## 2. Supplement: 1,000 specimens spread over 250 species (instead of 60)

Same run with `PERF_SIZES=1000 PERF_SPECIES=250`:

| Request                                                 | median / p95             | SQL stmts (payload) | vs. 60 species             |
| ------------------------------------------------------- | ------------------------ | ------------------- | -------------------------- |
| `GET /today`                                            | 266.6 / 278.6            | 2542 (510)          | 3.4x time, 4.0x statements |
| `GET /specimens/hints`                                  | 135.2 / 142.9            | 1266 (254)          | 3.4x, 4.0x                 |
| `GET /specimens/cards`                                  | 143.7 / 150.6            | 1286 (258)          | 2.8x, 3.8x                 |
| `GET /specimens/distribution`                           | 134.3 / 141.1            | 1276 (256)          | 3.1x, 3.9x                 |
| `GET /specimens/light-overview`                         | 135.0 / 144.8            | 1266 (254)          | 3.3x, 4.0x                 |
| `GET /specimens/difficulty`                             | 135.7 / 142.1            | 1266 (254)          | 3.2x, 4.0x                 |
| `GET /discover/suggestions`                             | 153.5 / 164.1            | 1283 (259)          | 3.1x, 3.9x                 |
| `GET /pokedex/cards`                                    | 156.2 / 164.9            | 1268 (256)          | 3.1x, 4.0x                 |
| `GET /pokedex/ownership`                                | 143.2 / 152.1            | 1261 (253)          | 3.3x, 4.1x                 |
| `GET /wishes/candidates`                                | 140.6 / 148.5            | 1286 (258)          | 3.6x, 3.8x                 |
| `GET /specimens`, `/specimens/count`, `GET /species?q=` | 15.2, 2.7, 19.0 (median) | 17, 11, 17          | unchanged                  |

## 3. Findings

- ✅ **No request grows faster than linearly in the number of specimens.** From 100 to 1,000 specimens (10x) the SQL statement count of every request is identical and the median grows at most 1.3x, except `GET /specimens` (4.0x, 3.4 to 13.9 ms), which is plain row serialization of a body that grows 10x (345 KB). The one-to-one growth is in the body, not in the work: `/specimens/cards` and `/specimens` return 335 to 345 KB of JSON for 1,000 specimens, with no paging.
- ⚠️ **N+1 on species, not on specimens.** Every derived request (Heute, Sammlung cards, hints, distribution, light overview, difficulty, Entdecken suggestions, Pokédex cards and ownership, wish candidates) issues about 5 SQL statements per distinct species the account holds (one `withAccount` transaction each) on top of a fixed base: 316 statements at 60 species, 1,266 at 250 species (4x for 4.2x the species), median 40 to 50 ms at 60 species and 135 to 155 ms at 250. The loop is in `readSpecies` in `app/packages/core/src/pokedex/ownership/ownership.ts` (`Promise.all(ids.map((id) => deps.species.find(userId, id)))`), which all those requests share. `GET /today` does it twice (642 statements at 60 species, 2,542 at 250; 78 ms and 267 ms). With a pool of 4 connections this serializes under concurrent users, which this single-user measurement does not show.
- ⚠️ **Fixed cost per request is high.** Even with 100 specimens a derived request needs 311 to 336 statements and 31 to 77 ms locally; `GET /specimens` and `GET /species?q=` (no per-species loop) need 17 statements and 3 to 12 ms. Heute (`/today` plus `/specimens/hints`) costs 958 statements together at 60 species.
- ⚠️ **Large bodies without paging:** `/specimens/cards` 335 KB and `/specimens` 345 KB at 1,000 specimens, `/pokedex/cards` 154 KB for the 500-taxon catalog regardless of the specimen count, `GET /species?q=` 34 KB with 60 species (not the shared catalog size). On a phone with an average network (NFR-12) these sizes, not the server time, will decide; compression (#588) shrinks them, paging does not exist yet.
- The first measured requests of a run carry cold-start noise (`/pokedex/ownership` p95 106.6 ms at size 100 against 49.8 ms at size 1,000; `/pokedex/cards` p95 94.8 against 55.4). The "0.6x" and "1.0x" rows are that noise, not a speed-up with more data.

## 4. Limits of this measurement (P-08)

- One machine, one run per size, 30 timed calls each; no confidence intervals. Timings are a lower bound for production: no network, TLS or compression, no concurrent users, a local PostgreSQL with default settings (`shared_buffers` 128 MB), warm caches.
- Statement counts are exact for the seeded shape (60 or 250 species) and deterministic; times are not.
- The species list (`GET /species?q=`) was measured with 60 private species of the account and an empty search; it was not measured against a full shared catalog (the 500 taxa seeded here feed only Entdecken and the Pokédex).
- Not measured: treatments (BEH), photos, friends, swap, the web client (rendering, bundle), cold PostgreSQL caches, write requests, 10,000 specimens.
- Specimens are spread evenly over locations and species and carry exactly 2 measurements; a real collection is likely less even (assumption).
- The 500-taxon catalog is an assumption; the real catalog size is unknown.

## 5. Candidate thresholds (proposal only, not agreed, not a gate)

For a separate gate PR, to be decided by the owner after more runs and on CI hardware:

- Statement count per request must not depend on the number of distinct species: e.g. at most 40 statements for any derived request at 250 species (today: about 1,270). This is deterministic and needs no timing tolerance.
- Median and p95 of Heute, Sammlung cards and Entdecken suggestions with 1,000 specimens and 100 species: starting values to be taken from a measurement after the N+1 is fixed, not from this log.
- Body size of `/specimens/cards` per 1,000 specimens (today 335 KB) as input for a paging decision.

## 6. How to repeat

```
make db-up
PFLANZENDEX_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<port>/pflanzendex_test \
  npm run perf:measure -w @pflanzendex/api > result.json
```

Use a throw-away database (the script inserts catalog rows). `PERF_SIZES`, `PERF_RUNS` and `PERF_SPECIES` change the sizes, the timed runs and the species count. This run used its own container (`pflanzendex-perf-586`, port 54999), removed afterwards.

---

## 7. After the fix: species read in one batch (issue #600)

**Change:** `SpeciesStore` / `SpeciesSource` got `findMany(userId, ids)` (one statement in one `withAccount` transaction, `id = any($1::uuid[])` under the same visibility rule as `find`; unreadable and unknown IDs give `null`, order and length follow `ids`). `readSpecies` and every other per-ID loop over `species.find` in `core` that served the derived requests (cards, hints, distribution, light overview, difficulty, phases, archived, care-profile view and zone usage) use it. Same environment and method as above (own container `pflanzendex-nfr12-600`, port 54990, removed afterwards), date 2026-10-08.

SQL statements, total (payload), 60 species, identical at 100 and 1,000 specimens:

| Request                         | Before    | After   |
| ------------------------------- | --------- | ------- |
| `GET /today`                    | 642 (130) | 52 (12) |
| `GET /specimens/hints`          | 316 (64)  | 21 (5)  |
| `GET /specimens/cards`          | 336 (68)  | 41 (9)  |
| `GET /specimens/distribution`   | 326 (66)  | 31 (7)  |
| `GET /specimens/light-overview` | 316 (64)  | 21 (5)  |
| `GET /specimens/difficulty`     | 316 (64)  | 21 (5)  |
| `GET /discover/suggestions`     | 333 (69)  | 38 (10) |
| `GET /pokedex/cards`            | 318 (66)  | 23 (7)  |
| `GET /pokedex/ownership`        | 311 (63)  | 16 (4)  |
| `GET /wishes/candidates`        | 336 (68)  | 41 (9)  |

1,000 specimens over 250 species (`PERF_SIZES=1000 PERF_SPECIES=250`), median / p95 in ms and statements:

| Request                         | Before: ms    | Before: stmts | After: ms   | After: stmts |
| ------------------------------- | ------------- | ------------- | ----------- | ------------ |
| `GET /today`                    | 266.6 / 278.6 | 2542          | 51.0 / 63.3 | 52           |
| `GET /specimens/hints`          | 135.2 / 142.9 | 1266          | 39.7 / 58.9 | 21           |
| `GET /specimens/cards`          | 143.7 / 150.6 | 1286          | 47.8 / 59.3 | 41           |
| `GET /specimens/distribution`   | 134.3 / 141.1 | 1276          | 42.7 / 56.8 | 31           |
| `GET /specimens/light-overview` | 135.0 / 144.8 | 1266          | 40.0 / 55.1 | 21           |
| `GET /specimens/difficulty`     | 135.7 / 142.1 | 1266          | 43.2 / 56.3 | 21           |
| `GET /discover/suggestions`     | 153.5 / 164.1 | 1283          | 65.6 / 92.0 | 38           |
| `GET /pokedex/cards`            | 156.2 / 164.9 | 1268          | 70.9 / 88.9 | 23           |
| `GET /pokedex/ownership`        | 143.2 / 152.1 | 1261          | 45.3 / 63.0 | 16           |
| `GET /wishes/candidates`        | 140.6 / 148.5 | 1286          | 43.4 / 55.7 | 41           |

- The statement count no longer depends on the number of species: the 60-species and 250-species runs give the same counts per request (candidate threshold of section 5, first bullet: met, at most 52 statements).
- The remaining time at 250 species is CPU and payload: the bodies of `light-overview`, `difficulty` and `pokedex/ownership` grow with the species (17 to 72 KB, 20 to 85 KB, 18 to 76 KB). `/today` still needs 52 statements as a fixed cost; that is a separate topic from the species loop.
- `query-count-baseline.json` (US-QG-07) is empty now: all seven entries (`/today`, cards, distribution, light overview, difficulty, hints, discover suggestions) stopped growing and were deleted.
- Limits as in section 4: one run, one machine, times are not deterministic; statement counts are.

## 7. Issue #1235: species visibility as a stored column (2026-11-04)

**Branch:** `fix/issue-1235-performance-species-visibility` (PR #1269, draft).
**Environment:** Intel N100 (4 cores), Linux, Node v26.13.0, PostgreSQL 18.6 in Docker (`postgres:18.6-alpine3.24`, `--memory` 512 MB, loopback); the measured role is the non-superuser owner, queries run as `pflanzendex_app` with `set local role` and `app.account_id` set per transaction, as `withAccount` does. Another agent ran builds in parallel on the same 3 GB box during the perf runs, so timings carry load noise (see the caveats).

**Cause:** the SELECT policy `visible` on `species` called the `SECURITY DEFINER` function `species_status()` for every scanned row. One `count(*)` over the catalog made one `review_case` index scan per species row (1,260 scans for 1,260 species). Migration 0102 stores the review status and the creator of the review case on the species row; triggers keep them current (`species_review_copy`, `review_case_species_sync`, both `enable always`). The row rules are unchanged; the policies become column predicates. The review case stays the source of truth.

### 7.1 EXPLAIN ANALYZE, same dataset before and after

Method: a scratch database owned by the owner role, migrated to 0101, loaded with 1,260 species (600 curated, 600 foreign private proposals, 60 own proposals of the measured account, so 660 are visible to it), one Latin name per species; then migrated to 0102, which backfills all rows (verified: 0 mismatches against `review_case`). Each statement run 15 times as `pflanzendex_app` inside a rolled-back transaction, first 3 runs dropped, median reported (min to max in brackets). The EXPLAIN text is in `scratchpad` (not committed).

| Query (as the app role)                | Before (0101) median ms | After (0102) median ms |
| -------------------------------------- | ----------------------- | ---------------------- |
| `select id from species` (policy only) | 61.8 (59.7 to 64.1)     | 1.55 (1.45 to 1.64)    |
| species search, empty term (first 50)  | 102.2 (100.7 to 105.1)  | 3.8 (3.7 to 5.4)       |
| species search, term in 600 names      | 136.6 (132.8 to 156.5)  | 9.6 (8.6 to 12.3)      |
| species search, term in no name        | 128.6 (125.2 to 133.1)  | 3.6 (3.4 to 4.0)       |

Earlier runs on the same kind of dataset, before the owner DB was reset (not re-run, same method): policy 60.4 ms; option (a) 1.76 to 1.87 ms (the one chosen); option (b), a security-barrier view with an inlinable `exists`, 7.6 ms (the planner built a hashed subplan); no-policy floor 0.23 ms (returns all 1,260 rows, so only a floor).

Search results: the old and the new SQL return the same species ids for the empty term, the 600-name term and the no-match term (compared on the same data).

The 600-name search first took 78 ms: the planner estimates one matching name for `like`, and joined `species` by a seq scan per match. The page now uses `a.id in (select ... like ...)` (a semi-join), which brought it to 9.6 ms with identical results.

### 7.2 Trigram index: not used by the application role

The first version also created `pg_trgm` and a GIN trigram index on `species_name(norm)`. The application role cannot use it: `textlike` (`like`) is not leakproof, so with row security on `species_name` PostgreSQL applies the policy quals before the `like` filter and never uses the index. Control: the same query on a copy of `species_name` without row security uses the index (`Bitmap Index Scan on ...trgm`). Superuser queries use it too, but the application never runs as superuser. The index and the extension were removed again; they would only have cost writes.

**Open question for the owner (not decided here):** serve the search from a table of approved names without row rules (approved names are visible to everybody, so this changes no visibility), or accept the scan that the search does now.

### 7.3 Perf: `npm run perf:measure -w @pflanzendex/api`, 1,000 specimens, 60 species, 30 timed runs (median ms)

Dataset as in section 1 (60 species, 1,000 specimens, 500 taxa). Before: fresh DB at 0098, run 12:42 UTC. After: fresh DB at 0102, run 13:11 UTC (this run still had the trigram index, which was removed afterwards; reads do not use it, so the timings are not affected by it in principle). Only the rows that matter are shown; full data in the run's JSON.

| Request                                       | Before median | After median | SQL statements before → after |
| --------------------------------------------- | ------------- | ------------ | ----------------------------- |
| `GET /species?q=` (Artenliste)                | 12.1          | 4.8          | 11 → 11                       |
| `GET /today?timeZone=…`                       | 66.1          | 58.1         | 106 → 106                     |
| `GET /specimens/cards?timeZone=…`             | 47.5          | 29.6         | 51 → 51                       |
| `GET /discover/suggestions?timeZone=…&deck=1` | 64.0          | 36.2         | 65 → 65                       |
| `GET /pokedex/cards?timeZone=…`               | 30.9          | 17.9         | 25 → 25                       |

All 13 requests have the same statement count and the same body size before and after. Caveat: the before and after runs were not under the same machine load (the other agent's builds), and the other endpoints do not depend on the species visibility in this dataset; the differences of the other endpoints cannot be attributed to the change. The `/species?q=` list is the request that uses the visibility rule directly.

### 7.4 Limits

- One machine, one run per state, 30 timed calls; the timings are not comparable with the Ryzen figures of sections 1 to 3.
- The perf dataset has 60 species per account, so the catalog-size effect is not visible in section 7.3; section 7.1 has 1,260 species. 10,000 species and the scaling claim are not measured.
- The species search still scans `species_name` (no index under row security); its cost grows with the number of names in the catalog.
- Not measured: concurrent users, cold caches, write requests.
