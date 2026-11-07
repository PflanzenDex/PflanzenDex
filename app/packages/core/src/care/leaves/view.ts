// The leaf log of one plant (US-WAC-07): derived on every read, never stored (P-01). The leaves come newest first; the
// count and the comparison are computed from them.
import type { SpecimenStore } from "../../collection";
import { compareLeaves } from "./comparison";
import type { LeafLogView, LeafStore } from "./types";

export interface LeafLogDependencies {
  readonly leaves: Pick<LeafStore, "list">;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** Whether the keeper switched the leaf log off (US-ONB-09). */
  readonly keeperOff: (userId: string) => Promise<boolean>;
}

/**
 * The leaves of one plant of the keeper (US-WAC-07). A foreign or unknown plant gives `null`, so the answer looks the
 * same for both (P-04). With the keeper switch off the view holds no leaves, and the stored rows stay (P-12, P-10).
 */
export async function leafLogView(
  deps: LeafLogDependencies,
  userId: string,
  specimenId: string,
): Promise<LeafLogView | null> {
  const specimen = await deps.specimens.find(userId, specimenId);
  if (!specimen) return null;
  if (await deps.keeperOff(userId))
    return { specimenId: specimen.id, keeperOff: true, count: 0, comparison: null, leaves: [] };
  const leaves = await deps.leaves.list(userId, specimen.id);
  return {
    specimenId: specimen.id,
    keeperOff: false,
    count: leaves.length,
    comparison: compareLeaves(leaves),
    leaves,
  };
}
