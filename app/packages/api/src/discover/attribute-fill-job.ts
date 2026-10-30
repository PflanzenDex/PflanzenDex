import {
  ATTRIBUTE_FILL_JOB_TYPE,
  orderAttributeFill,
  runAttributeFill,
  orderOrThrow,
} from "@pflanzendex/core";
import type { AttributeFillStore, JobHandlers } from "@pflanzendex/core";
import { CatalogSourceClaims, JobsPostgres, TaxonAttributesPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Whether the attribute fill runs (US-ENT-09, P-08). It reads only the answers the catalog fill already stored, so it
 * sends nothing to any server, but it writes shared catalog data; it is opt-in like the catalog fill: only
 * `ATTRIBUTE_FILL=on` starts it, not setting it keeps it off. Any other non-empty value stops the start (P-10).
 * Without `CATALOG_FILL=on` there are no stored answers, so the job then has nothing to do.
 */
export function attributeFillEnabled(env: { ATTRIBUTE_FILL?: string | undefined }): boolean {
  const value = (env.ATTRIBUTE_FILL ?? "").trim();
  if (value === "" || value === "off") return false;
  if (value === "on") return true;
  throw new Error(`ATTRIBUTE_FILL must be "on" or "off", got "${value}"`);
}

// The owner connection: the stored source answers come from the catalog (its port, AB-9), the facts go to the shared
// table (the app role may not write it). A species that already has a growth size is not a candidate again, which makes
// the job repeatable. `TaxonAttributesPostgres` has the shape of the core `save`; the cast joins `db` and `core` types.
export const attributeFillStore = (pool: Pool): AttributeFillStore => {
  const facts = new TaxonAttributesPostgres(pool);
  const claims = new CatalogSourceClaims(pool);
  return {
    heightCandidates: async () => {
      const done = new Set(await facts.speciesWith("growthSize"));
      return (await claims.wikidataClaims("P2048")).filter((c) => !done.has(c.latinName));
    },
    save: (list) => facts.save(list as Parameters<TaxonAttributesPostgres["save"]>[0]),
  };
};

/** Handler of the attribute fill job, composed in `main.ts` next to the other job handlers. */
export function attributeFillJobHandlers(deps: { readonly pool: Pool }): JobHandlers {
  return {
    [ATTRIBUTE_FILL_JOB_TYPE]: async () => {
      await runAttributeFill({ store: attributeFillStore(deps.pool) });
    },
  };
}

/** Queues the fill when a species has a height claim and no growth size (first start and every later check). */
export function checkAttributeFill(pool: Pool, now: () => Date) {
  const queue = new JobsPostgres(pool);
  return orderAttributeFill({
    store: attributeFillStore(pool),
    order: orderOrThrow({ queue, now }),
  });
}
