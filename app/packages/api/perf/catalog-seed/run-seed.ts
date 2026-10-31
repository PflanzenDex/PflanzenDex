import { openPool, testDatabaseUrl } from "@pflanzendex/db";
import { assertSeedAllowed, SeedRefused } from "../demo-seed/access/guard.ts";
import { seedCatalog } from "./seed-catalog.ts";
import { SEED_SPECIES } from "./species-list.ts";

// Usage: PFLANZENDEX_ENV=local npm run seed:catalog -w @pflanzendex/api   (dev and test databases only; idempotent)
// Same hard lock as the demo seed (#991): the seed uses a superuser connection and starting values, so it never
// touches production. Production gets its catalog with `npm run catalog:load` (docs/guides/operations/release-and-rollback.md).
const databaseUrl = testDatabaseUrl();
try {
  assertSeedAllowed(process.env, databaseUrl);
} catch (error) {
  if (error instanceof SeedRefused) {
    console.error(error.message.replace("Demo seed", "Catalog seed"));
    process.exit(1);
  }
  throw error;
}
const pool = openPool(databaseUrl);
try {
  const { created } = await seedCatalog(pool, SEED_SPECIES);
  console.log(
    `Catalog seed: ${created} species added, ${SEED_SPECIES.length - created} already present.`,
  );
} finally {
  await pool.end();
}
