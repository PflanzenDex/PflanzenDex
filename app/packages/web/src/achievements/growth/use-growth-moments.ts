import { useCallback } from "react";
import { useRequest } from "../../shared/data";
import { loadGrowth, type GrowthMoment } from "../achievements-api";

export interface GrowthMoments {
  readonly latest: GrowthMoment;
  /** The ids of the measurements that set a personal record. */
  readonly records: ReadonlySet<string>;
  /**
   * The copy on screen may be older than the last save: a newer answer is on its way, or the last read failed. Absent
   * means the answer is current. The card shows the copy either way; a confirmation waits for the current answer before
   * it reads the growth note (US-QS-08, issue 2323, the same rule as issue 1795).
   */
  readonly stale?: boolean;
}

/**
 * Growth moment and records of a specimen (US-ACH-05). The query key lies under the measurements of the specimen, so
 * saving a measurement reloads it. `null` while loading, in calm mode (US-ACH-08) and on a read error: a side feature
 * never breaks the page and never shows an error of its own. A copy kept from before a save is `stale` until the read
 * after the save answers.
 */
export function useGrowthMoments(
  api: string,
  token: () => Promise<string | undefined>,
  specimenId: string,
): GrowthMoments | null {
  const load = useCallback((t: string) => loadGrowth(api, t, specimenId), [api, specimenId]);
  const r = useRequest({ queryKey: ["care", "measurements", specimenId, "growth"], token, load });
  const v = r.value;
  if (!v || v.calmMode || typeof v.latest !== "object") return null;
  const stale = r.refreshing || r.status !== "ready" || r.offline;
  return { latest: v.latest, records: new Set(v.records), stale };
}
