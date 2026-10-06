import {
  TAXONOMY_JOB_TYPE,
  enqueueJob,
  orderTaxonomyBuild,
  runTaxonomyBuild,
} from "@pflanzendex/core";
import type { JobHandlers, SourceClient, TaxonomyDependencies } from "@pflanzendex/core";
import { JobsPostgres, SpeciesPostgres, TaxonomyPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

export interface PokedexJobDeps {
  /** Owner connection: the build reads the approved catalog and replaces the tree (the app role may not). */
  readonly pool: Pool;
  readonly sources: SourceClient;
}

const taxonomy = (pool: Pool): TaxonomyDependencies => ({
  names: { latinNames: () => new SpeciesPostgres(pool).approvedLatinNames() },
  store: new TaxonomyPostgres(pool),
});

/** Handlers of the module's background jobs (US-POK-03), composed in `main.ts` next to the `jobs` register. */
export function pokedexJobHandlers(deps: PokedexJobDeps): JobHandlers {
  return {
    [TAXONOMY_JOB_TYPE]: (_job, now) =>
      runTaxonomyBuild({ ...taxonomy(deps.pool), sources: deps.sources }, now),
  };
}

/**
 * Checks once whether the catalog differs from the tree and queues the build if so; without a change nothing is
 * queued (US-POK-03). Returns what happened, errors are thrown to the caller (P-10).
 */
export function checkTaxonomy(pool: Pool, now: () => Date) {
  const queue = new JobsPostgres(pool);
  return orderTaxonomyBuild({
    ...taxonomy(pool),
    order: async (type, dedupeKey) => {
      const r = await enqueueJob({ queue, now }, { type, dedupeKey });
      if (!r.ok) throw new Error(r.error.code);
    },
  });
}

/** Runs `check` now and then every `intervalMs` (starting value: hourly) until the returned stop is called. */
export function scheduleChecks(
  check: () => Promise<unknown>,
  intervalMs: number,
  report: (error: unknown) => void,
): () => void {
  const run = () => void check().catch(report);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
