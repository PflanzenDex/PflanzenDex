import { ok } from "../../../kernel";
import type { Result, SourceClient } from "../../../kernel";
import { dig } from "../types";
import type { GenusCount } from "../types";

/**
 * Number of accepted species of a genus (GBIF). "No hit" and a count of 0 both mean unknown (`null`, P-08).
 * A source failure is an error, not an "unknown" (P-10).
 */
export async function genusSpeciesCount(
  sources: SourceClient,
  genus: string,
): Promise<Result<GenusCount | null>> {
  const match = await sources.get({
    source: "gbif",
    path: "/species/match",
    query: { name: genus, rank: "GENUS", kingdom: "Plantae" },
  });
  if (!match.ok) return match;
  const key = match.value.kind === "found" ? dig(match.value.data, "usageKey") : undefined;
  const isGenus = match.value.kind === "found" && dig(match.value.data, "rank") === "GENUS";
  if (typeof key !== "number" || !isGenus) return ok(null);
  const count = await sources.get({
    source: "gbif",
    path: "/species/search",
    query: { rank: "SPECIES", status: "ACCEPTED", highertaxonKey: String(key), limit: "0" },
  });
  if (!count.ok) return count;
  const value = count.value.kind === "found" ? dig(count.value.data, "count") : undefined;
  return ok(
    typeof value === "number" && value > 0 ? { value, provenance: count.value.provenance } : null,
  );
}
