import { ok } from "../../../kernel";
import type { Result, SourceClient } from "../../../kernel";
import { enrichText, genusSpeciesCount } from "../enrich";
import { resolveLineages } from "../resolve";
import type { GenusCount, Taxon, TaxonFailure } from "../types";

export interface BuiltTree {
  readonly taxa: readonly Taxon[];
  readonly failures: readonly TaxonFailure[];
}

/** Trims, collapses spaces, drops duplicates and sorts: the same names always give the same order (idempotent). */
export const normalizeNames = (names: readonly string[]): string[] =>
  [...new Set(names.map((n) => n.trim().replace(/\s+/g, " ")).filter((n) => n !== ""))].sort();

/**
 * Builds the tree from the catalog names: lineage (OpenTree), then Wikipedia/Wikidata text and the GBIF species count
 * of each genus (once per genus). Unresolvable names land in `failures` with a reason. A source failure returns the
 * error and builds nothing, so the caller keeps the previous good tree (US-POK-03).
 */
export async function buildTaxonomy(
  sources: SourceClient,
  names: readonly string[],
): Promise<Result<BuiltTree>> {
  const resolution = await resolveLineages(sources, normalizeNames(names));
  if (!resolution.ok) return resolution;
  const counts = new Map<string, GenusCount | null>();
  const taxa: Taxon[] = [];
  for (const [latinName, lineage] of resolution.value.resolved) {
    const text = await enrichText(sources, lineage.acceptedName);
    if (!text.ok) return text;
    if (!counts.has(lineage.genus)) {
      const count = await genusSpeciesCount(sources, lineage.genus);
      if (!count.ok) return count;
      counts.set(lineage.genus, count.value);
    }
    taxa.push({
      latinName,
      lineage,
      text: text.value,
      genusSpeciesCount: counts.get(lineage.genus) ?? null,
    });
  }
  const failures = [...resolution.value.failures].sort((a, b) =>
    a.latinName.localeCompare(b.latinName),
  );
  return ok({ taxa, failures });
}
