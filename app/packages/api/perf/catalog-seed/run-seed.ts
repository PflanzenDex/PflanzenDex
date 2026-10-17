import { openPool, testDatabaseUrl } from "@pflanzendex/db";
import { seedCatalog } from "./seed-catalog.ts";
import { SEED_SPECIES } from "./species-list.ts";

// Usage: npm run seed:catalog -w @pflanzendex/api   (dev and test databases only; idempotent)
const pool = openPool(testDatabaseUrl());
try {
  const { created } = await seedCatalog(pool, SEED_SPECIES);
  console.log(
    `Catalog seed: ${created} species added, ${SEED_SPECIES.length - created} already present.`,
  );
} finally {
  await pool.end();
}
