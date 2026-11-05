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

---

## 8. Audit 2026-11-04, wave 1: perf seed and sign-in guard (issues #1234, #1236)

**Environment:** the same workstation, throw-away `postgres:18.6-alpine3.24` container per run, `PERF_SIZES=100,1000`, 30 timed runs per request (median / p95 in ms).

- **#1234 (PR #1253):** `perf/seed.ts` posted every measurement without `timeZone` and with values off the 0.5 grid and never read the reply, so every `perf:measure` run since `timeZone` became required had **zero measurements**. Every seed write now fails loudly on a non-2xx reply, and a row-count check after seeding requires `n` specimens, `2n` measurements and 10 wishes. After the fix: perf-100 has 100 specimens and 200 measurements, perf-1000 has 1,000 and 2,000. Statement counts are unchanged by the fix; `/specimens/cards` now carries the measurements (1,000 specimens: 390,551 → 451,550 bytes). Numbers in earlier sections that were measured after `timeZone` became required ran on empty measurement tables.
- **#1236 (PR #1256):** the sign-in guard was registered for `/x` and `/x/*`, and Hono's `/x/*` also matches `/x`, so every exact-path request admitted the account twice (6 statements and one transaction more). `GET /account` no longer writes `account_data` on every read (only when the row is missing, the token changed or `last_active_at` is older than an hour).

| Request           | Before: stmts (payload) | After: stmts (payload) | 1,000 specimens, median / p95 ms: before → after |
| ----------------- | ----------------------- | ---------------------- | ------------------------------------------------ |
| `GET /today`      | 112 (24)                | 106 (22)               | 36.8 / 49.2 → 33.8 / 43.2                        |
| `GET /specimens`  | 17 (5)                  | 11 (3)                 | 14.0 / 22.6 → 14.9 / 23.0                        |
| `GET /species?q=` | 17 (5)                  | 11 (3)                 | 9.4 / 17.6 → 8.4 / 16.5                          |

The other measured requests were guarded once already and are unchanged. Latency differences are within run-to-run noise (one run each); the statement counts are exact.

---

## 9. Issue #1242: pool size, time limits and database memory (2026-11-04)

**Environment:** the same workstation (AMD Ryzen 5 3600, 12 threads), Node v24.21.0. PostgreSQL 18.6 in a throw-away container (`postgres:18.6-alpine3.24`, loopback port). **Before:** commit `792190a8` (the claim), pool of 4 connections, PostgreSQL defaults, no memory limit. **After:** this branch: pool of 12 connections (`PFLANZENDEX_DB_POOL_MAX`, the new default), limits of 5 s per statement, 3 s per lock and 30 s idle inside a transaction; the container with `--memory 384m` and `shared_buffers` 128 MB, `work_mem` 4 MB and `effective_cache_size` 256 MB (the compose settings).

Concurrency: `npm run perf:concurrency -w @pflanzendex/api` (`perf/load/concurrency.ts`): the Heute screen (`/today` and `/specimens/hints`, one after the other) per virtual user, 32 accounts with 100 specimens each, 10 s per level after a 2 s warm-up. Latency is per screen. The "before" runs used an earlier version of the script that took the pool size from `PERF_POOL_MAX` and built a plain `pg` pool of that size (no timeouts, as the old production pool); the accounts were seeded once and reused.

### 9.1 Concurrency: the pool size sweep at 32 users

| Pool connections | Before: screens/s | Before: median ms | Before: p95 ms | After: screens/s | After: median ms | After: p95 ms |
| ---------------- | ----------------- | ----------------- | -------------- | ---------------- | ---------------- | ------------- |
| 4 (old default)  | 59.7              | 534.0             | 558.3          | 59.2             | 537.2            | 561.4         |
| 8                | 88.2              | 356.2             | 403.7          | 94.4             | 338.4            | 357.4         |
| 12 (new default) | 99.5              | 321.6             | 343.3          | 105.7            | 301.4            | 321.4         |
| 16               | 110.3             | 284.2             | 325.1          | 109.9            | 289.1            | 314.8         |

Rule for the default: the smallest pool that reaches at least 90 % of the best throughput. The best measured throughput is about 110 screens/s (16 connections). 8 connections reach 94 screens/s (86 %), 12 reach 106 (96 %). **12 is the new default.** Above 12 the gain is small (16 connections: about 4 % more throughput), so the larger pool buys little for its extra connections.

### 9.2 Concurrency: all levels, before (4 connections) and after (12 connections)

| Virtual users | Before (pool 4): screens/s | median ms | p95 ms | After (pool 12, new default): screens/s | median ms | p95 ms |
| ------------- | -------------------------- | --------- | ------ | --------------------------------------- | --------- | ------ |
| 1             | 36.0                       | 27.2      | 35.9   | 36.3                                    | 26.9      | 34.6   |
| 4             | 59.3                       | 66.9      | 79.9   | 95.2                                    | 41.8      | 51.4   |
| 8             | 60.2                       | 132.3     | 147.2  | 106.3                                   | 75.1      | 88.6   |
| 16            | 60.4                       | 263.8     | 287.9  | 106.0                                   | 150.3     | 166.7  |
| 32            | 59.7                       | 534.0     | 558.3  | 105.7                                   | 301.4     | 321.4  |

With 4 connections the old code is limited by the pool (throughput flat at about 60 screens/s from 4 users on). The per-transaction limits add no measurable cost: the "after" numbers with 4 connections are equal to the "before" ones (59.2 against 59.7 screens/s at 32 users, median 537 against 534 ms).

### 9.3 Endpoints: `npm run perf:measure` (4 connections in the harness, 30 runs)

Statement counts are the same before and after for every endpoint: the request frame (`begin`, `set local role`, one `select set_config` with the account and the three limits, `commit`) has the same number of statements as before, and the counts are the same ones that the query-count gate watches.

| Screen     | Request                                       | SQL stmts (payload), before = after | Median ms, 100: before / after | Median ms, 1,000: before / after |
| ---------- | --------------------------------------------- | ----------------------------------- | ------------------------------ | -------------------------------- |
| Heute      | `GET /today?timeZone=…`                       | 106 (22)                            | 18.6 / 17.5                    | 37.5 / 38.3                      |
| Heute      | `GET /specimens/hints`                        | 21 (5)                              | 10.3 / 11.9                    | 17.9 / 17.3                      |
| Sammlung   | `GET /specimens/cards?timeZone=…`             | 51 (11)                             | 10.9 / 12.2                    | 30.3 / 31.2                      |
| Sammlung   | `GET /specimens`                              | 11 (3)                              | 3.3 / 3.1                      | 13.4 / 14.2                      |
| Sammlung   | `GET /specimens/count`                        | 11 (3)                              | 1.5 / 1.9                      | 2.4 / 2.6                        |
| Sammlung   | `GET /specimens/distribution`                 | 31 (7)                              | 10.6 / 11.5                    | 17.4 / 17.0                      |
| Sammlung   | `GET /specimens/light-overview`               | 26 (6)                              | 12.6 / 12.2                    | 17.9 / 17.6                      |
| Sammlung   | `GET /specimens/difficulty`                   | 26 (6)                              | 9.9 / 11.2                     | 16.0 / 17.8                      |
| Entdecken  | `GET /discover/suggestions?timeZone=…&deck=1` | 65 (17)                             | 27.9 / 29.7                    | 45.6 / 43.7                      |
| Entdecken  | `GET /pokedex/cards?timeZone=…`               | 25 (9)                              | 19.1 / 19.1                    | 29.5 / 30.6                      |
| Entdecken  | `GET /pokedex/ownership?timeZone=…`           | 16 (4)                              | 11.2 / 10.9                    | 22.1 / 21.3                      |
| Entdecken  | `GET /wishes/candidates`                      | 51 (11)                             | 10.9 / 11.0                    | 18.7 / 17.8                      |
| Artenliste | `GET /species?q=`                             | 11 (3)                              | 8.9 / 7.5                      | 8.5 / 9.2                        |

### 9.4 Database container memory (`docker stats`, one sample per second)

| Run                       | Settings                                                | Peak memory of `db` |
| ------------------------- | ------------------------------------------------------- | ------------------- |
| `perf:measure` before     | defaults, no limit, 4 connections                       | 77 MiB              |
| `perf:measure` after      | 384 MB limit, 128 MB shared buffers, 4 MB work_mem      | 59 MiB              |
| `perf:concurrency` before | no limit, pool 4 to 16, includes seeding of 32 accounts | 92 MiB              |
| `perf:concurrency` after  | no limit, pool 4 to 16                                  | 94 MiB              |

The owner database had no temporary file (`pg_stat_database.temp_files` = 0) after all concurrency runs, so `work_mem` 4 MB was not too small for this workload. The measured dataset is small (27 MB, 32 accounts, 3,200 specimens); a larger database fills the buffer pool up to `shared_buffers` (128 MB) and each connection adds its own memory. The limit of 384 MB is therefore a starting value (assumption) with about four times the measured peak, not a measured maximum.

---

## 10. Unlock facts: one aggregate and existence checks (issue #1241)

**Change:** `GET /onboarding/unlocks` is loaded on every signed-in page (`UnlocksProvider`) and refetched after every write. It read every specimen to collect the dates and the active count, read the lists of wishes, friends, requests, offers, swaps and equipment only for their length, and awaited the other reads one after another. Now one aggregate over `specimen` gives the active count and the earliest `created_at`, one `exists` per module answers the existing-data question on the same rows under the same row rules, and `Promise.all` runs the independent reads. The lock rules get the same facts, so the answer does not change; `unlock-sources.test.ts` compares every source with the old list-based answer on data with the edge cases (archived specimens, a date that differs by time zone, ended and declined friendships, a withdrawn offer, a canceled swap, retired equipment, a second account).

**Environment:** Intel Core Ultra 7 255H (16 cores), Node v24.21.0, PostgreSQL 18.6 in Docker, date 2026-11-04. The machine was shared with other sessions during the first run (load average up to 12). Same method as section 1: 1,000 specimens over 60 species, 3 warm-up and 30 timed calls, one counted call. The "before" rows are the code before the change (the branch's HEAD), run twice; the "after" row is the final code.

| Request                              | Run                    | 100: median / p95 (ms) | 1,000: median / p95 (ms) | SQL stmts (payload) at 100 and 1,000 |
| ------------------------------------ | ---------------------- | ---------------------- | ------------------------ | ------------------------------------ |
| `GET /onboarding/unlocks?timeZone=…` | before, run 1          | 10.0 / 13.0            | 38.5 / 100.3             | 66 (14)                              |
| `GET /onboarding/unlocks?timeZone=…` | before, run 2 (paired) | 14.3 / 19.4            | 42.5 / 79.7              | 66 (14)                              |
| `GET /onboarding/unlocks?timeZone=…` | after                  | 5.6 / 7.8              | 5.1 / 7.8                | 56 (12)                              |

- The gap between 100 and 1,000 specimens is gone: the median is 5.6 ms at 100 and 5.1 ms at 1,000 specimens, against the target of under 20 ms at 1,000.
- The statement count drops from 66 to 56 (payload 14 to 12): five existence checks replace the seven lists, and one summary row replaces the specimen list. Both counts are exact for this shape.
- The other endpoints were not changed. Their timings moved by up to 2x between runs on this shared machine, so they are not compared here.

**Limits (P-08):** one machine, one run per state (plus the paired "before" run), no concurrent users, no network. The first attempt wrote its rows into the schema database of the test suite and made the catalog tests time out; the perf harness is meant for a throw-away database (section 6). The rows were removed and the suite passes on the reset database.

---

## 11. Issue #1235: species visibility as a stored column (2026-11-04)

**Branch:** `fix/issue-1235-performance-species-visibility` (PR #1269, draft).
**Environment:** Intel N100 (4 cores), Linux, Node v26.13.0, PostgreSQL 18.6 in Docker (`postgres:18.6-alpine3.24`, `--memory` 512 MB, loopback); the measured role is the non-superuser owner, queries run as `pflanzendex_app` with `set local role` and `app.account_id` set per transaction, as `withAccount` does. Another agent ran builds in parallel on the same 3 GB box during the perf runs, so timings carry load noise (see the caveats).

**Cause:** the SELECT policy `visible` on `species` called the `SECURITY DEFINER` function `species_status()` for every scanned row. One `count(*)` over the catalog made one `review_case` index scan per species row (1,260 scans for 1,260 species). Migration 0102 stores the review status and the creator of the review case on the species row; triggers keep them current (`species_review_copy`, `review_case_species_sync`, both `enable always`). The row rules are unchanged; the policies become column predicates. The review case stays the source of truth.

### 11.1 EXPLAIN ANALYZE, same dataset before and after

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

### 11.2 Trigram index: not used by the application role

The first version also created `pg_trgm` and a GIN trigram index on `species_name(norm)`. The application role cannot use it: `textlike` (`like`) is not leakproof, so with row security on `species_name` PostgreSQL applies the policy quals before the `like` filter and never uses the index. Control: the same query on a copy of `species_name` without row security uses the index (`Bitmap Index Scan on ...trgm`). Superuser queries use it too, but the application never runs as superuser. The index and the extension were removed again; they would only have cost writes.

**Decided (owner, 2026-11-04):** no trigram index in this change; the search keeps scanning `species_name` under row security. A table of approved names without row rules (approved names are visible to everybody, so it changes no visibility) is a possible follow-up, not part of this change.

### 11.3 Perf: `npm run perf:measure -w @pflanzendex/api`, 1,000 specimens, 60 species, 30 timed runs (median ms)

Dataset as in section 1 (60 species, 1,000 specimens, 500 taxa). Before: fresh DB at 0098, run 12:42 UTC. After: fresh DB at 0102, run 13:11 UTC (this run still had the trigram index, which was removed afterwards; reads do not use it, so the timings are not affected by it in principle). Only the rows that matter are shown; full data in the run's JSON.

| Request                                       | Before median | After median | SQL statements before → after |
| --------------------------------------------- | ------------- | ------------ | ----------------------------- |
| `GET /species?q=` (Artenliste)                | 12.1          | 4.8          | 11 → 11                       |
| `GET /today?timeZone=…`                       | 66.1          | 58.1         | 106 → 106                     |
| `GET /specimens/cards?timeZone=…`             | 47.5          | 29.6         | 51 → 51                       |
| `GET /discover/suggestions?timeZone=…&deck=1` | 64.0          | 36.2         | 65 → 65                       |
| `GET /pokedex/cards?timeZone=…`               | 30.9          | 17.9         | 25 → 25                       |

All 13 requests have the same statement count and the same body size before and after. Caveat: the before and after runs were not under the same machine load (the other agent's builds), and the other endpoints do not depend on the species visibility in this dataset; the differences of the other endpoints cannot be attributed to the change. The `/species?q=` list is the request that uses the visibility rule directly.

### 11.4 Limits

- One machine, one run per state, 30 timed calls; the timings are not comparable with the Ryzen figures of sections 1 to 3.
- The perf dataset has 60 species per account, so the catalog-size effect is not visible in section 11.3; section 11.1 has 1,260 species. 10,000 species and the scaling claim are not measured.
- The species search still scans `species_name` (no index under row security); its cost grows with the number of names in the catalog.
- Not measured: concurrent users, cold caches, write requests.

## 12. Issue #1238: friend, feed and shared views read once per specimen (2026-11-04)

**Branch:** `chore/issue-1238-performance-n-1-in` (PR #1271, draft).
**Environment:** Linux, Node, PostgreSQL 18.6 in Docker (loopback, worktree test database); the counts come from the query-count gate, which runs the app in process as a signed-in keeper. These are statement counts, not timings.

**Cause:** `describe(ownerId, ids)` in `api/src/social/sharing/wiring.ts` read each shared specimen with `specimens.find` and then its species with `species.find`: about ten statements per shared specimen, each a `withAccount` transaction. The viewer's names (`mine.latinNamesOf`, the basis of "you have it" and of the count of shared species) re-read the viewer's own collection once per friend in `GET /friends`.

**Fix:** `describe` reads the rows with `SpecimenPostgres.findMany` and their species with `SpeciesPostgres.findMany`: two reads for any number of shared specimens, with the same row rules, the same order, the same archived filter and the same approval filter. The viewer's names come from the new `SpeciesPostgres.latinNamesOf(userId, ids)`, one statement with the same visibility as `find` (own proposals and approved species); the ids come from the collection port, and `GET /friends` reads them once per request. No route, field, order or visibility rule changes.

### 12.1 Statement counts of the gate (2 friends, keeper with 5 or 50 specimens)

Method: `npx vitest run src/query-count.test.ts` in `app/packages/api`; each route is called twice per size and the second call is counted (every statement, including the `begin`, `set local role`, `set_config`, `commit` of each `withAccount`). Before: the merge base with `origin/dev` (f271b110, the code before this change). After: this branch.

| Route                         | Before small (5) | Before large (50) | After small (5) | After large (50) |
| ----------------------------- | ---------------- | ----------------- | --------------- | ---------------- |
| `GET /feed`                   | 96               | 536               | 56              | 56               |
| `GET /friends`                | 151              | 1,041             | 61              | 61               |
| `GET /friends/:id/collection` | 81               | 526               | 41              | 41               |
| `GET /friends/:id/shared`     | 51               | 271               | 31              | 31               |

The growth with the shared specimens is gone for all four routes. The growth baseline `query-count-baseline.json` is now empty (`{}`).

### 12.2 Statement counts with 2 and 6 friends (one keeper, friends with 4 species and 2 shared specimens each)

Method: a block of its own in the same test file (`NFR-12 friend views ...`), so the gate sizes above keep their seed. The keeper has 3 specimens. The same keeper is measured with 2 friends, then with 6 friends. The "before" column is the same test on the code before this change (the assertions fail there; only the counts are read).

| Route (first friend for the friend routes) | Before, 2 friends | Before, 6 friends | After, 2 friends | After, 6 friends |
| ------------------------------------------ | ----------------- | ----------------- | ---------------- | ---------------- |
| `GET /friends`                             | 111               | 311               | 61               | 141              |
| `GET /feed?timeZone=…`                     | 76                | 196               | 56               | 136              |
| `GET /friends/:id/shared`                  | 41                | 41                | 31               | 31               |
| `GET /friends/:id/collection`              | 61                | 61                | 41               | 41               |

The friend routes of one friend are flat in the number of friends. Before this change `/friends/:id/shared` cost 21 statements plus 10 per shared specimen (41 for 2 shared specimens here, 51 for 3 and 271 for 25 in the gate); after it costs 31 for any number, the two reads of rows and species (10 statements) on top of the same 21.

### 12.3 What remains per friend

`GET /friends` and `GET /feed` grow by 20 statements per friend (141 - 61 and 136 - 56: 80 for four more friends), and not with the number of shared specimens. Each friend costs four reads in the owner's context: `friend_shares` (the viewer's context), the privacy flag of the owner's profile, the owner's shared rows and the owner's species. Under the row rules these cannot be merged across owners without a batch `security definer` function, which would change how friend shares are read: that is the scope of #1240 (account data and friend shares read twice), so the count with 2 and 6 friends is not equal for these two routes. Both read the owner's rows once per friend, one statement per table (`findMany`), so the cost per friend does not depend on the shares.

### 12.4 Baselines and statement repeats

- `query-count-baseline.json`: all four growth entries removed (the gate deletes an entry that no longer grows). The #1240 part of the growth reasons of `/feed` and `/friends` is kept as a note in the test file; the duplicate reads of `friend_shares` and the privacy flag stay in `query-repeat-baseline.json` for those two routes.
- `query-repeat-baseline.json`: the entries of `/friends/:id/collection` and `/friends/:id/shared` removed (their repeats were the specimen and species texts of #1238). `/feed` and `/friends` keep their entries: the specimen and species statements repeat once per friend, as the owner's row rule requires.

### 12.5 Limits

- Statement counts only; no timing claim. Not measured: concurrent requests, cold caches, friends beyond 6.
- The "before" block counts come from the same test on the old route code with the new seed; they were read from a temporary dump in the test (not committed).

## 13. Issue #1249: catalog-scaling gate for species reads (2026-11-04)

**Branch:** `chore/issue-1249-gate-species-reads-must` (PR #1268). Test: `app/packages/db/src/species-catalog-scaling.test.ts` (5 tests, names carry NFR-12 and US-QG-07, about 3 s, part of the db suite in `app-tests`).
**Environment:** Linux, PostgreSQL 18.6 in Docker (loopback, worktree test database), scratch database owned by `pflanzendex_test_owner` (row security applies). Counts are deterministic; the timings are single runs and not a claim.

**Purpose:** the per-account query-count gate counts statements, so it cannot see a read whose cost grows with the whole shared catalog (#1235). The gate seeds 100 species and 2,000 species for the same viewer. The 1,900 extra species are invisible to the viewer: 1,500 private proposals of another account, 200 rejected and 200 merged ones. The viewer sees 50 approved species and 10 of its own proposals in both catalogs, so every read returns the same rows. Reads: the species list, two searches (`gatea`, `gatea 1`) and the Pokedex facts (`APPROVED_FACTS`). The statements are the ones the adapters run (`searchQuery` and `APPROVED_FACTS` in `catalog/species/species-read.ts`), not approximations.

**Fail rule:** the large catalog costs more than FACTOR = 2 times the small one (starting value, an assumption: not measured on a real catalog). The base is at least one function call, because the reviewer check runs once per statement and may run zero or one time depending on the plan; a constant never fails.

### 13.1 Metric choice

Candidates were measured on the current dev code with the same statements and the same data (PostgreSQL, `ANALYZE` after each seed; the numbers come from a temporary copy of the test that adds `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, not committed).

| Candidate | Passes dev (must be flat) | Detects the pre-0102 policy | Verdict |
| --- | --- | --- | --- |
| Shared buffer hits (`EXPLAIN`) | no: list 3.0x, search 3.3x, Pokedex facts 22x | weakly (list 1.5x, facts 1.6x) | rejected: the sequential scan of the table grows with the table itself, which is the accepted cost, not per-row work |
| Subplan loops (`SubPlan` and `InitPlan` nodes) | no for search: 2.9x (the name lookups of `species_name` are the accepted linear scan); list and facts flat | no: the old policy calls a function, not a subplan (list and search 58 loops at both sizes) | rejected: it misses the policy cost it should catch |
| Function calls (`pg_stat_user_functions`, `track_functions = all`) | yes: 0 to 1 call at both sizes | yes for the search (8.6x and 11.1x) | **chosen** |

The chosen metric is the sum of the calls of all user functions per statement (delta of the cumulative counters around the statement, flushed by the same session, `pg_stat_force_next_flush()` and `pg_stat_clear_snapshot()`). The gate runs the reads as `pflanzendex_app` (`enterApplicationRole`, the same as `withAccount`), so the policy calls are the real ones.

### 13.2 Numbers on dev (current policies), 100 vs 2,000 species

| Read | Function calls 100 | Function calls 2,000 | Shared hits 100 | Shared hits 2,000 | SubPlan loops 100 | SubPlan loops 2,000 |
| --- | --- | --- | --- | --- | --- | --- |
| Species list (50 rows) | 1 (`is_reviewer`) | 1 (`is_reviewer`) | 71 | 213 (3.0x) | 59 | 59 |
| Species search `gatea` (50 rows) | 1 | 0 | 315 | 1,038 (3.3x) | 61 | 178 (2.9x) |
| Species search `gatea 1` (36 rows) | 1 | 0 | 257 | 830 (3.2x) | 49 | 142 (2.9x) |
| Pokedex facts (50 rows) | 0 | 0 | 2 | 44 (22x) | 0 | 0 |

The gate passes on dev: every read is flat for function calls. The buffer and subplan columns show why they are not the metric: the same statements would fail on the healthy code.

### 13.3 Numbers with the pre-0102 per-row policy (the self-test), 100 vs 2,000 species

The old policies are the ones of migrations 0012 (`visible` on `species` and `species_name`: `species_status(id) is not null`) and 0017 (`reviewer_reads`: `is_reviewer() and is_open_proposal(id)`). The self-test applies them inside a transaction on the same data, measures, and rolls back (no policy is left behind; a test checks it).

| Read | Function calls 100 | Function calls 2,000 | Factor | `species_status` 100 to 2,000 | Shared hits 100 to 2,000 |
| --- | --- | --- | --- | --- | --- |
| Species list (50 rows) | 202 | 202 | 1.0x (not detected) | 110 to 110 | 480 to 740 (1.5x) |
| Species search `gatea` (50 rows) | 502 | 4,302 | **8.6x (fails)** | 270 to 2,170 | 1,179 to 9,331 (7.9x) |
| Species search `gatea 1` (36 rows) | 376 | 4,176 | **11.1x (fails)** | 208 to 2,108 | 857 to 8,873 (10.4x) |
| Pokedex facts (50 rows) | 100 | 100 | 1.0x (not detected) | 50 to 50 | 152 to 244 (1.6x) |

The list and the Pokedex facts stay flat under the old policy, and the search does not. The reason is the planner's order of the predicates: the list and the facts filter the viewer's rows with their own column predicates (`review_status`, `review_account`), and those run before the policy function, so the policy is called only for the rows the statement returns (110 and 50). The search reads `species_name` and applies the policy before its own `like` filter, so the policy runs for every name in the catalog (2,170 calls at 2,000 species). The same policy cost is therefore visible only where a statement cannot pre-filter. Both search terms fail the gate with this message (the first one, the other has the same shape):

> NFR-12 (#1235, US-QG-07): species read "species search (term "gatea")" grows with the shared catalog. Metric: function calls per statement (pg_stat_user_functions, track_functions = all). 100 species: 502 calls, 2000 species: 4302 calls, factor 8.6x (limit 2x). Functions at 2000 species: public.is_reviewer 2132, public.species_status 2170. A lookup per catalog row is the usual cause; see docs/records/test-logs/nfr-12.md, section 13.

Rows: the same rows under both policies and both sizes (a test checks it).

### 13.4 Limits

- The gate does not see a per-row policy cost in a statement that filters the same rows first (list, Pokedex facts): by design of the statements, the cost there is flat in function calls. A regression of that kind shows only where a statement reads the table before its own filter, such as the search. A policy-only probe (for example `select id from species` as the viewer) would close the gap, but it is not a read of the API; it is a possible follow-up, not part of this gate.
- The seq scan of the table grows with the catalog (buffer hits 3x on dev at 20x the species); it is accepted (no trigram index, owner decision on #1235) and is not gated.
- Statement shapes and plans are those of PostgreSQL 18 with `ANALYZE` on fixed data; a plan change in a later version can change the counts of the 0 or 1 `is_reviewer` calls (absorbed by the base of one call) but not the per-row calls.
- Two catalog sizes, one viewer, one filler shape (other accounts' proposals, rejected and merged species). Not measured: several viewers, reviewers (they see more rows), a catalog of 20,000 species.

---

## 14. Issue #1237: swap offers read once per owner (PR #1275, 2026-11-04)

**Source:** the numbers of this section and of sections 15 to 18 are copied from the merged pull requests; nothing was measured again for this record.

**Change:** the care phase is computed for all named specimens at once, and the exchange reads facts, health and phase once per owner instead of once per offer.

Statements per request, query-count gate seed at 5 and 50 specimens:

| Request                | Before      | After     |
| ---------------------- | ----------- | --------- |
| `GET /offers`          | 121 / 3651  | 36 / 36   |
| `GET /exchange/offers` | 291 / 10821 | 91 / 91   |
| `GET /exchange/match`  | 336 / 10941 | 136 / 131 |

**Limits (P-08):** the gate seed was extended in the same PR (friend species got a dormancy period); without it `/exchange/offers` measured 1571 before the fix. The drop of 5 on `/exchange/match` depends on the data and was not traced. Reads per owner still repeat their statement text once per friend with offers; the repeat gate cannot tell that from a read per offer. The byte comparison of the three answers ran before two later refactors and was not repeated.

## 15. Issue #1239: achievements read each kind once (PR #1274, 2026-11-04)

**Change:** measurements and done treatments are read once for all specimens instead of once per specimen.

Statements per request, gate seed (2 measurements and 1 treatment per specimen):

| Request                    | 5 specimens: before | 50: before | 5: after | 50: after |
| -------------------------- | ------------------- | ---------- | -------- | --------- |
| `GET /achievements`        | 91                  | 541        | 51       | 51        |
| `GET /achievements/news`   | 91                  | 541        | 51       | 51        |
| `GET /achievements/rhythm` | 91                  | 541        | 51       | 51        |
| `GET /achievements/year`   | 111                 | 786        | 46       | 46        |

The answers of all four routes, `year` also with `?year=2025`, were byte-identical before and after for two seeded keepers.

**Limits (P-08):** `rhythm` still reads the measurements of archived specimens and ignores them. `anniversaries.ts` still reads measurements per anniversary due today, outside these four routes.

## 16. Issue #1240: one read per request and account (PR #1273, 2026-11-04)

**Result: target not reached.** `GET /today` is at 66 statements, not the "about 40" of the issue; the other half of its Done, no identical statement twice in one request, is met. The remaining 13 transactions cost 4 frame statements each, plus 14 payload statements. Going lower needs one transaction per request, a change of the tenant frame (P-04). The issue stays open for that decision.

**Issue dataset** (`perf:measure`, 1,000 specimens, 60 species, 500 taxa, no dormancy): `GET /today` 106 → 66 statements (payload 22 → 14), median 26.7 → 14.2 ms (2 runs only, indicative). `GET /specimens/cards` is unchanged at 51.

**Phased dataset** (50 specimens, 12 species, dormancy on every species; a temporary script, not committed):

| Request                          | Statements (transactions) before | After   | Repeated statements |
| -------------------------------- | -------------------------------- | ------- | ------------------- |
| `GET /today`                     | 356 (71)                         | 66 (13) | 4 → 0               |
| `GET /care-phases`               | 271 (54)                         | 21 (4)  | 1 → 0               |
| `GET /watering/due`              | 36 (7)                           | 26 (5)  | 2 → 0               |
| `GET /equipment/needs`           | 56 (11)                          | 41 (8)  | 2 → 0               |
| `GET /equipment/recommendations` | 56 (11)                          | 41 (8)  | 2 → 0               |

The answers of the five routes for the same account were byte-identical before and after.

## 17. Issue #1243: index gaps (PR #1270, 2026-11-04)

**Method:** `EXPLAIN (ANALYZE, BUFFERS)` on synthetic data (among others `ai_log` 328,500 rows, `review_case` 20,000, `species` 20,000, `taxon_attribute` 25,000, `job` 65,205), as `pflanzendex_app` where row-level security applies. Medians of 5 runs in a local Docker database, so times are indicative only. An index was added only where the plan uses it.

| Query                           | Before (median ms) | After (median ms) | Change                           |
| ------------------------------- | ------------------ | ----------------- | -------------------------------- |
| Review list, open cases         | 2.14               | 0.95              | `review_case_open`               |
| Review list, curated batch      | 53.3               | 0.29              | `review_case_curated_species`    |
| Species search without a filter | 424                | 3.96              | `species_latin_name`             |
| `taxon_attribute` by field      | 4.28               | 0.44              | `taxon_attribute_field`          |
| Expiry update of `ai_task`      | 0.258              | 0.086             | `md5(reference)` meets the index |

`countSince` on a heavy account (10 connections, 365,000 extra rows) fell from 458 buffers to 5 through `ai_log_connection_day`.

**Limits (P-08):** a species search with no hit does not change (about 870 to 920 ms on this dataset). No index was added for the job expiry sweep, because `job_due` already serves a realistic queue (0.63 ms, 0.83 ms with the candidate). Whether `location_zone` is redundant needs `idx_scan` from production. The indexes are built without `concurrently`, so a build blocks writes to its table (`ai_log`: 190 ms at 328,500 rows); check its size before deploying.

## 18. Wave 5: web (issues #1244, #1245, #1247; PRs #1267, #1264, #1262, 2026-11-04)

Issue #1246 (lists without server paging) belongs to this wave and is still open, so `GET /specimens/cards` keeps its size.

### 18.1 Issue #1244: requests of Heute

Production build, demo seed `states` (50 specimens), 390x844, Playwright request log.

| Step             | Requests before | After                            |
| ---------------- | --------------- | -------------------------------- |
| Cold start       | 13              | 14                               |
| Heute → Sammlung | 4               | 3                                |
| Back to Heute    | 10              | 9                                |
| Reload           | 13              | 13, all revalidated, 0 B of body |

**Limits (P-08):** the request count did not fall on a cold start; the gain is bytes on repeated loads. The first paint of the tasks is not faster (still about 420 ms, held by the Suspense reveal after the lazy chunk). With `/specimens/count` delayed by 1.5 s the tasks were requested at 409 ms instead of 1915 ms, so the count no longer gates them. Regression, not fixed there: `/feed/banner` is sometimes fetched twice, which is the 14th request.

### 18.2 Issue #1245: thumbnails

Stored copy 245 to 411 KB, 256 px thumbnail 0.9 to 2.3 KB, measured on **generated** test images only; real photos will have larger thumbnails, not measured. Photos stored before the PR have no thumbnail and still transfer in full size until replaced. Lighthouse on Sammlung is not recorded; that part of the issue moved to #1251.

### 18.3 Issue #1247: initial JS

| Step                                            | Initial JS (gzip) |
| ----------------------------------------------- | ----------------- |
| Baseline                                        | 138.5 kB          |
| Dialog of `ResponsiveModal` loads on first open | 126.6 kB          |
| Locked rows leave the shell                     | 121.4 kB          |
| Heute chunk requested early                     | 121.5 kB          |

The goal of 125 kB is met. **Limit:** until its chunk has loaded, the first open of a dialog shows nothing, which is visible only on a slow network right after page load.

---

## 19. Issue #1246: paged collection list, shared tree, capped search (2026-11-05)

**Environment:** the same workstation, throw-away `postgres:18.6-alpine3.24` container, `PERF_SIZES=100,1000`, 30 timed runs, one run. The perf seed carries measurements, so the cards are realistic; the API test of the same limit uses bare plants and proves less. "Before" is section 8 and the audit baseline, so times come from different runs; the sizes and statement counts are exact.

| Request at 1,000 specimens | Body before | Body after | Median ms before | After | SQL before | After |
| -------------------------- | ----------- | ---------- | ---------------- | ----- | ---------- | ----- |
| `GET /specimens/cards`     | 451,550 B   | 45,363 B   | about 30         | 9.4   | 51         | 52    |
| `GET /pokedex/cards`       | about 212 KB | 217,203 B | about 19 to 30   | 18.6  | 25         | 25    |

**Result:** the first page of Sammlung is 45.4 KB raw at 1,000 specimens, under the 60 KB of the issue. The body no longer grows with the collection (44,784 B at 100, 45,363 B at 1,000).

**Limits (P-08):**

- A page of 100 is only the first read: Sammlung also reads `GET /specimens/cards/summary`, which `perf:measure` does not list, so its cost is not in this table.
- `GET /pokedex/cards` shows no gain at the 500 taxa of the standard seed: the version read costs the one statement the tree read cost, and the body is unchanged. With a larger catalog the gain is clear, see 19.1. The catalog facts stay a read per request, because corrections and the catalog fill change them without a new build (FR-POK-13).
- After a write all loaded pages are read again, up to 10 requests at 1,000 plants when all are loaded (owner decision: kept for now).
- The AI and MCP species search still shows 50 hits without saying that more match.

### 19.1 Pokédex tree cache with a larger catalog

Temporary, uncommitted edits: the taxa count of `perf/seed.ts` and a switch for the cache. `PERF_SIZES=100`, 30 timed runs, runs alternating off, on, on, off on a fresh database each. Another session ran short browser scripts at the same time, which the alternating order absorbs. Median ms of `GET /pokedex/cards`:

| Taxa   | Raw body    | Cache off      | Cache on     | Change        |
| ------ | ----------- | -------------- | ------------ | ------------- |
| 5,000  | 2,186,704 B | 38.5 and 38.3  | 25.1 and 23.0 | about 37 % less |
| 20,000 | 8,786,705 B | 136.8 and 127.3 | 75.6 and 76.4 | about 42 % less |

**Limit:** the body grows with the catalog, about 437 B per taxon, and is sent whole, because the cards are not paged (FR-POK-13). Production compresses it in the proxy; the compressed size was not measured. A catalog of this size would make the body, not the read, the cost that matters.

### 19.2 Browser check beyond the first page

The one-screen gate seeds 50 plants, so it never reaches a further page. A temporary Playwright spec (not committed) signed in a real account and answered the card reads with 250 plants: first page of 100, a slow further page, then a failing one with the API's error shape. At 360x640 and 390x844 the loading and the failed state fit: document height equals the window, no horizontal scroll, "Erneut versuchen" in view above the pager. The failed read was not repeated by itself.

An error without a `text` made the Pager ask for the page again every 315 ms (30 requests in 9 s), because the Pager recognised a failure by its text. The API always sends a text, so only a foreign answer, such as a proxy's, could cause it. Fixed in this PR with a fallback text, and tested.

**Not checked in a browser:** 200 % text in these two states, and the direct link to a plant that is not loaded (covered by tests only).

---

## 20. Issue #1240: every transaction opens in one round trip (2026-11-05)

**Change:** `begin`, the role switch and the settings go in one simple-protocol query (`beginAsApplicationRole`), so a transaction costs 2 round trips of frame instead of 4. Reads keep their own transactions; the owner decided against one transaction per GET request. Role, settings and transaction scope are unchanged (P-04). Every value is written with `client.escapeLiteral`, because a sign-in subject is free text. `catalog-load.ts` keeps the old order: it takes an advisory lock between `begin` and the role switch.

**Result:** `GET /today` is at 40 statements (issue target: about 40), down from 66, with no statement text twice. The 14 payload statements are unchanged.

**Method:** a temporary uncommitted switch between the old and the new opening, same code otherwise, fresh `postgres:18.6-alpine3.24` per run, order old, new, new, old. `perf:measure` at 1,000 specimens with 30 timed runs; `perf:concurrency` with pool 12, 100 specimens, 10 s per level. Another session ran short browser measurements at the same time, which the alternating order absorbs.

| Request at 1,000 specimens | Statements before | After | Median ms before | After      |
| -------------------------- | ----------------- | ----- | ---------------- | ---------- |
| `GET /today`               | 66                | 40    | 25.9, 26.4       | 23.5, 25.7 |
| `GET /specimens/cards`     | 52                | 32    | 8.1, 8.3         | 7.9, 7.8   |
| `GET /onboarding/unlocks`  | 56                | 34    | 4.3, 4.1         | 4.0, 3.4   |
| `GET /wishes/candidates`   | 51                | 31    | 14.1, 12.4       | 12.5, 12.3 |

| Virtual users | Screens/s before | After        | Median ms before | After        | p95 ms before | After        |
| ------------- | ---------------- | ------------ | ---------------- | ------------ | ------------- | ------------ |
| 1             | 76.5, 73.6       | 79.7, 80.8   | 12.9, 13.5       | 12.4, 12.2   | 16.4, 17.2    | 15.7, 15.4   |
| 16            | 167.6, 165.6     | 187.1, 192.5 | 93.2, 95.4       | 84.8, 81.3   | 114.1, 112.5  | 104.5, 106.1 |
| 32            | 169.5, 165.2     | 194.6, 193.4 | 187.3, 190.8     | 161.1, 164.7 | 216.5, 221.5  | 192.0, 194.8 |

At 32 users that is about 16 % more screens per second and a median about 14 % lower.

**Limits (P-08):** one machine over loopback, two runs per state. A single request hardly changes; the gain is under load. Part of the drop in statements is counting: the opening still executes its statements, they travel as one call. A real network between API and database, even a container network, adds latency to each round trip; that was not measured here.
