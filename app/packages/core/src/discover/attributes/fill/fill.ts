import { checkAttributeFact } from "../attributes";
import type { AttributeFact } from "../attributes";
import { deriveGrowthSize } from "./derive";
import type { HeightCandidate } from "./derive";

export const ATTRIBUTE_FILL_JOB_TYPE = "catalog.fill_attributes";

/**
 * Database side of the attribute fill. It works on the answers the catalog fill (US-BES-12) already stored, so the job
 * itself sends nothing to any server.
 */
export interface AttributeFillStore {
  /** Approved species whose stored Wikidata answer has a height claim and that have no growth size yet. */
  heightCandidates(): Promise<readonly HeightCandidate[]>;
  /** Stores the facts, replacing a fact of the same species and field (one row each). */
  save(facts: readonly AttributeFact[]): Promise<void>;
}

/**
 * Queues the job when a species has a height claim and no growth size; nothing otherwise. Open jobs share one dedupe
 * key, so every repeated check orders at most one job (idempotent, US-QS-03).
 */
export async function orderAttributeFill(deps: {
  readonly store: AttributeFillStore;
  readonly order: (type: string, dedupeKey: string) => Promise<void>;
}): Promise<"queued" | "up_to_date"> {
  if ((await deps.store.heightCandidates()).length === 0) return "up_to_date";
  await deps.order(ATTRIBUTE_FILL_JOB_TYPE, "fill-attributes");
  return "queued";
}

/**
 * Job handler (US-ENT-09): turns the cited height into the growth size of each candidate, checks every fact like any
 * researched value (source, https link, free license, date; a refused fact is an error, never stored, P-10) and stores
 * the valid ones. A species without a usable claim gets no fact and stays "unknown" (P-08). Repeatable: a stored field
 * is not asked again, and storing the same fact twice leaves one row.
 */
export async function runAttributeFill(deps: {
  readonly store: AttributeFillStore;
}): Promise<{ readonly stored: number }> {
  const facts: AttributeFact[] = [];
  const failures: string[] = [];
  for (const c of await deps.store.heightCandidates()) {
    const derived = deriveGrowthSize(c);
    if (derived === null) continue;
    const checked = checkAttributeFact(derived);
    if (checked.ok) facts.push(checked.fact);
    else failures.push(`${c.latinName}: ${checked.problems.join(",")}`);
  }
  await deps.store.save(facts);
  if (failures.length > 0) throw new Error(failures.join("; "));
  return { stored: facts.length };
}
