import { openPool, testDatabaseUrl } from "@pflanzendex/db";
import {
  createS3ObjectStore,
  createSharpProcessor,
  s3ConfigFromEnv,
} from "../../src/media/index.ts";
import { subjectsFromKeycloak } from "./access/subjects.ts";
import { assertSeedAllowed, SeedRefused } from "./access/guard.ts";
import { seedAll } from "./accounts/seed-all.ts";
import { SEED_SPECIES } from "../catalog-seed/species-list.ts";
import { seedCatalog } from "../catalog-seed/seed-catalog.ts";
import { PROFILES, seedStates, type Profile } from "./states/profile.ts";

// Usage: PFLANZENDEX_ENV=local npm run seed:demo -w @pflanzendex/api
// Fills the dev accounts test, test2 and test3 (#924). Local or test setups only; idempotent. See app.md "Demo seed".
// `DEMO_SEED_PROFILE=states` adds the feature states of states/states-map.md after the base seed (US-DEV-01, #1072): worktree or test
// databases only, never the shared dev database.
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
  await seedAll(pool, {
    subjects,
    withPhotos: !!media,
    ...(media ? { media } : {}),
    log: console.log,
  });
  if (profile === "states") await seedStates(pool, { subjects, log: console.log });
  console.log(`Demo seed done (${profile}): test, test2 and test3 (password testtest12).`);
} finally {
  await pool.end();
}
