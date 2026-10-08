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
