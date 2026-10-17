import type { CatalogNames, TaxonomyStore } from "../types";
import { buildTaxonomy, normalizeNames } from "./build";
import type { SourceClient } from "../../../kernel";

export const TAXONOMY_JOB_TYPE = "pokedex.build_taxonomy";

/** Stable hash of the sorted names (cyrb53; not a security measure, only change detection). */
export function fingerprintOf(names: readonly string[]): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const ch of normalizeNames(names).join("\n")) {
    const code = ch.codePointAt(0) ?? 0;
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export interface TaxonomyDependencies {
  readonly names: CatalogNames;
  readonly store: TaxonomyStore;
}

/**
 * Orders a build when the catalog differs from the stored tree; without a change nothing is queued (US-POK-03). The
 * dedupe key is the fingerprint, so repeated checks while a build is open queue one job.
 */
export async function orderTaxonomyBuild(
  deps: TaxonomyDependencies & {
    /** Queues the job (the API composes it from the job queue; `pokedex` does not depend on `jobs`). */
    readonly order: (type: string, dedupeKey: string) => Promise<void>;
  },
): Promise<"queued" | "up_to_date" | "empty"> {
  const names = normalizeNames(await deps.names.latinNames());
  if (names.length === 0) return "empty";
  const fingerprint = fingerprintOf(names);
  if ((await deps.store.fingerprint()) === fingerprint) return "up_to_date";
  await deps.order(TAXONOMY_JOB_TYPE, fingerprint);
  return "queued";
}

/**
 * Job handler: builds the tree and replaces the stored one atomically. Repeatable (same inputs, same tree). A failure
 * throws with the error code, so the runner records it and retries with backoff (P-10); the old tree stays.
 */
export async function runTaxonomyBuild(
  deps: TaxonomyDependencies & { readonly sources: SourceClient },
  now: Date,
): Promise<void> {
  const names = normalizeNames(await deps.names.latinNames());
  const fingerprint = fingerprintOf(names);
  if (names.length === 0 || (await deps.store.fingerprint()) === fingerprint) return;
  const built = await buildTaxonomy(deps.sources, names);
  if (!built.ok) throw new Error(built.error.code);
  await deps.store.replace({ fingerprint, builtAt: now.toISOString(), ...built.value });
}
