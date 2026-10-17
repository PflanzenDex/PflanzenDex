import { deriveFields } from "./derive";
import { fetchSnapshots } from "./fetch";
import type { SourceClient } from "../../kernel";
import type { CatalogFillStore } from "./types";

export const CATALOG_FILL_JOB_TYPE = "catalog.fill_from_sources";

/**
 * Queues the fill when approved species have gaps; nothing is queued otherwise. Open jobs share one dedupe key, so the
 * first start and every repeated check order at most one job (idempotent, US-QS-03).
 */
export async function orderCatalogFill(deps: {
  readonly store: CatalogFillStore;
  readonly order: (type: string, dedupeKey: string) => Promise<void>;
}): Promise<"queued" | "up_to_date"> {
  if ((await deps.store.candidates()).length === 0) return "up_to_date";
  await deps.order(CATALOG_FILL_JOB_TYPE, "fill");
  return "queued";
}

/**
 * Job handler (US-BES-12): per species with gaps ask the sources, keep the raw answers and fill the empty fields with
 * their provenance. Species are independent: one failing source does not stop the others, but the job then throws the
 * error codes so the runner retries with backoff and records them (P-10). Already stored values stay; a rerun only
 * touches species that still have gaps, so it is repeatable.
 */
export async function runCatalogFill(deps: {
  readonly store: CatalogFillStore;
  readonly sources: SourceClient;
}): Promise<{ readonly filled: number }> {
  const failures: string[] = [];
  let filled = 0;
  for (const c of await deps.store.candidates()) {
    const fetched = await fetchSnapshots(deps.sources, c.id, c.latinName);
    if (!fetched.ok) {
      failures.push(`${c.latinName}: ${fetched.error.code}`);
      continue;
    }
    const values = deriveFields(fetched.value, c.latinName, c.empty);
    await deps.store.record(c.id, fetched.value, values);
    filled += values.length;
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
  return { filled };
}
