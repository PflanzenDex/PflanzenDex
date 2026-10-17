import {
  CATALOG_FILL_JOB_TYPE,
  enqueueJob,
  orderCatalogFill,
  runCatalogFill,
} from "@pflanzendex/core";
import type { CatalogFillStore, JobHandlers, SourceClient } from "@pflanzendex/core";
import { CatalogFillPostgres, JobsPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Whether the catalog fill from open sources runs (US-BES-12, FR-BES-18, P-08). It asks foreign servers, so it is
 * opt-in everywhere: only `CATALOG_FILL=on` starts it, not setting it keeps it off (no silent network traffic in
 * tests, development or a fresh installation). Any other non-empty value stops the start instead of being read as
 * "off" (P-10): a typo must not hide that the catalog stays empty.
 */
export function catalogFillEnabled(env: { CATALOG_FILL?: string | undefined }): boolean {
  const value = (env.CATALOG_FILL ?? "").trim();
  if (value === "" || value === "off") return false;
  if (value === "on") return true;
  throw new Error(`CATALOG_FILL must be "on" or "off", got "${value}"`);
}

// The owner connection: the job reads the approved catalog and writes the shared tables (the app role may not).
// `CatalogFillPostgres` has the shape of the core port; the cast only joins `db` and `core` types, which are separate.
export const catalogFillStore = (pool: Pool): CatalogFillStore =>
  new CatalogFillPostgres(pool) as CatalogFillStore;

/** Handler of the catalog fill job, composed in `main.ts` next to the other job handlers. */
export function catalogFillJobHandlers(deps: {
  readonly pool: Pool;
  readonly sources: SourceClient;
}): JobHandlers {
  return {
    [CATALOG_FILL_JOB_TYPE]: async () => {
      await runCatalogFill({ store: catalogFillStore(deps.pool), sources: deps.sources });
    },
  };
}

/** Queues the fill when approved species have gaps (first start and every later check); nothing otherwise. */
export function checkCatalogFill(pool: Pool, now: () => Date) {
  const queue = new JobsPostgres(pool);
  return orderCatalogFill({
    store: catalogFillStore(pool),
    order: async (type, dedupeKey) => {
      const r = await enqueueJob({ queue, now }, { type, dedupeKey });
      if (!r.ok) throw new Error(r.error.code);
    },
  });
}
