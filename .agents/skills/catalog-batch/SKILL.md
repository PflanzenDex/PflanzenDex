---
name: catalog-batch
description: Use when the operator adds a batch of 20 to 40 species to the catalog (US-POK-02): the curated start list, researched attributes, the data check, the dry run and the load, then the check of unresolved species after the taxonomy build.
---

# Catalog batch

The catalog grows in operator batches of proofread species (US-POK-02). A batch is the curated start list, the `TABLE` in `app/packages/api/src/catalog/load/start-species.ts`, loaded by `npm run catalog:load`. There is no batch tool: nothing creates a batch folder or counts its size, so the steps are manual. The target of 600+ species is data work (TE-12), not code.

Not built, so a batch must not rely on it:

- No command creates or validates a batch of 20 to 40 species. The lines are edited by hand.
- No operator warning when catalog and tree differ in the names (listed as missing in US-POK-03). Read the unresolved species instead (step 8).
- No command runs the taxonomy build by hand. It runs inside the API (step 7).
- Difficulty and light zone are not in the start list. They stay unknown until a cited source gives them (P-08).

1. Pick 20 to 40 species that are not in the catalog yet. A name is `Genus epithet`. The proposal path refuses hybrid signs and additions with `catalog.name_hybrid` and `catalog.name_addition` (US-POK-02). The loader, `prepareRecords` in `app/packages/api/src/catalog/load/catalog-loader.ts`, refuses a row that `parseLatin` cannot read and a name listed twice.
2. Add one line per species to `TABLE` in `start-species.ts`: `Latin|German|English|Family (Latin)|Family (German)|synonyms`, synonyms separated by `;`. Every row needs its family (the test in step 3 checks it). Leave a German or English name empty when no verified source gives it (P-08).
3. Check the list: `make test` runs the US-BES-12 tests in `app/packages/api/src/catalog/load/cli.test.ts`. They prove every row is a species name, listed once, with its family.
4. Research, optional and per species: attributes go into `app/packages/api/src/catalog/load/research/data/batch-<nn>/part-<n>.json` (a new batch folder per batch; `app/packages/api/src/catalog/load/research/data/batch-02/part-1.json` is an example), following `docs/guides/operations/catalog-research-howto.md` (a fixed source per value, nothing sourced means nothing written; at most 5 parts per folder, about 6 species per part). Every species must already be on the start list.
5. Data check, no database needed: it refuses any bad value, file, host or date, so a bad value is a refusal, not a warning.
6. Dry run and load against the target database, in the order of the runbook (`docs/guides/operations/release-and-rollback.md`, step 2). `DATABASE_URL` is required; without it the command refuses and never guesses a database.
   - `npm run catalog:load -w @pflanzendex/api -- --dry-run` prints the new and the present species and writes nothing.
   - `npm run catalog:load -w @pflanzendex/api -- --confirm <database name>` writes in one transaction, all or nothing. `CATALOG_LOAD_LOG` names a log file. Production runs both inside the api container.
7. The taxonomy build follows on its own. The API checks at start and then hourly whether the approved names differ from the stored tree (`checkTaxonomy` in `app/packages/api/src/pokedex/taxonomy-job.ts`) and queues `pokedex.build_taxonomy`. `TAXONOMY_BUILD=off` stops the check. In development, restart the API (`make dev`) to check at once.
8. Read the warnings. An unresolved species is a row of `taxon` with `status = 'unresolved'` and a `failure_code` (`taxonomy.no_match`, `taxonomy.not_species` or `taxonomy.lineage_missing`, see `app/packages/db/src/pokedex/taxonomy.ts`). The application role may read the table:
   ```sql
   select latin_name, failure_code from taxon where status = 'unresolved' order by latin_name;
   ```
   Every row is a finding (P-10): fix the name in the batch, or accept it with a reason in the PR. `select count(*) from taxon;` counts the rows of the tree.

## Check

```bash
cd app && npm run catalog:check-data -w @pflanzendex/api
make test
```

Expected: the data check prints `Research data ok: <files> files, <species> species, <values> values.` (on the current data: `6 files, 30 species, 12 values`). `make test` passes the US-BES-12 tests in `cli.test.ts`. The database part of those tests needs Docker; without it they run only in CI (`make ci`).
