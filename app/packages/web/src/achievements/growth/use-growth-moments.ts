import { useCallback } from "react";
import { useRequest } from "../../kernel";
import { loadGrowth, type GrowthMoment } from "../achievements-api";

export interface GrowthMoments {
  readonly latest: GrowthMoment;
  /** The ids of the measurements that set a personal record. */
  readonly records: ReadonlySet<string>;
}

/**
 * Growth moment and records of a specimen (US-ACH-05). The query key lies under the measurements of the specimen, so
 * saving a measurement reloads it. `null` while loading, in calm mode (US-ACH-08) and on a read error: a side feature
 * never breaks the page and never shows an error of its own.
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
  return { latest: v.latest, records: new Set(v.records) };
}
