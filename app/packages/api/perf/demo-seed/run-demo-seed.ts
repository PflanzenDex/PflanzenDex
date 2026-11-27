import { openPool, testDatabaseUrl } from "@pflanzendex/db";
import {
  createS3ObjectStore,
  createSharpProcessor,
  s3ConfigFromEnv,
} from "../../src/media/index.ts";
import { subjectsFromKeycloak } from "./access/subjects.ts";
import { assertSeedAllowed, SeedRefused } from "./access/guard.ts";
import { resetDemoFriends, restoreAchievementNews } from "./access/reset-demo.ts";
import { seedAll } from "./accounts/seed-all.ts";
import { SEED_SPECIES } from "../catalog-seed/species-list.ts";
import { seedCatalog } from "../catalog-seed/seed-catalog.ts";
import { replaceTaxonWithFixture, seedTaxonFixture } from "../catalog-seed/taxon-fixture.ts";
import { PROFILES, seedStates, type Profile } from "./states/profile.ts";
import { seedGateAccount } from "./accounts/common/gate-account.ts";
import { seedEmptyAccount } from "./accounts/common/empty-account.ts";

// Usage: PFLANZENDEX_ENV=local npm run seed:demo -w @pflanzendex/api
// Fills the dev accounts test, test2 and test3 (#924) and the empty account test7 (issue 2500, both profiles). Local or test
// setups only; idempotent. See app.md "Demo seed".
// `DEMO_SEED_PROFILE=states` adds the feature states of states/states-map.md after the base seed (US-DEV-01, #1072): worktree or test
// databases only, never the shared dev database. `DEMO_TAXON_FIXTURE=reset` replaces the Pokédex tree by the fixture CI uses
// (issue 2488); unset, a tree that is already there is kept.
const databaseUrl = process.env["DATABASE_URL"] ?? testDatabaseUrl();
try {
  assertSeedAllowed(process.env, databaseUrl);
} catch (error) {
  if (error instanceof SeedRefused) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
const profile = (process.env["DEMO_SEED_PROFILE"] ?? "base") as Profile;
if (!PROFILES.includes(profile)) {
  console.error(
    `Demo seed refused: unknown DEMO_SEED_PROFILE '${profile}'. Allowed: ${PROFILES.join(", ")}.`,
  );
  process.exit(1);
}
// An unknown value would keep a tree the owner meant to reset, so it refuses like an unknown profile (issue 2488).
const taxonFixture = process.env["DEMO_TAXON_FIXTURE"] ?? "";
if (taxonFixture !== "" && taxonFixture !== "reset") {
  console.error(
    `Demo seed refused: unknown DEMO_TAXON_FIXTURE '${taxonFixture}'. Allowed: reset (or unset).`,
  );
  process.exit(1);
}
const pool = openPool(databaseUrl);
try {
  const subjects = await subjectsFromKeycloak();
  await seedCatalog(pool, SEED_SPECIES); // the species the demo plants point at (operator batch, idempotent)
  const s3 = s3ConfigFromEnv(process.env);
  const media =
    s3 && "bucket" in s3
      ? { store: createS3ObjectStore(s3), processor: createSharpProcessor() }
      : undefined;
  if (!media)
    console.warn("No S3_* variables: placeholder photos are skipped (see app.md, Object storage).");
  // A run after a device check starts from the base friend requests again (US-DEV-01), before seedAll recreates them.
  await resetDemoFriends(pool, subjects);
  console.log(
    "Demo friend requests reset: Ben's request to Anna and other open, declined or ended requests removed; confirmed friends kept.",
  );
  await seedAll(pool, {
    subjects,
    withPhotos: !!media,
    ...(media ? { media } : {}),
    log: console.log,
  });
  // The empty account test7: no plant, wish or friend, in both profiles (issue 2500, the empty states of the Sammlung).
  await seedEmptyAccount(pool, { log: console.log });
  if (profile === "states") {
    await seedStates(pool, { subjects, log: console.log });
    // The Pokédex tree without foreign servers, so the card layers show content with TAXONOMY_BUILD=off (issue 1164).
    // `reset` replaces any other tree, so a local one-screen run measures the tree CI measures (issue 2488).
    const reset = taxonFixture === "reset";
    const outcome = reset ? await replaceTaxonWithFixture(pool) : await seedTaxonFixture(pool);
    console.log(`Pokédex tree fixture${reset ? " (reset)" : ""}: ${outcome}`);
    // The display gates' account with more than 100 plants (issue 1378); its own account, the three above stay as they are.
    await seedGateAccount(pool, { log: console.log });
    await restoreAchievementNews(pool, subjects);
    console.log("Achievement news restored: test2's first-handover is new again.");
  }
  console.log(
    `Demo seed done (${profile}): test, test2, test3 and the empty test7 (password testtest12).`,
  );
} finally {
  await pool.end();
}
