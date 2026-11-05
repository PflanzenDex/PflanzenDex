import type {
  ArchivedEntry,
  LightLocation,
  Distribution,
  SpecimenSummary,
} from "@pflanzendex/core";
import { useCallback, useEffect } from "react";
import { sharedLocations } from "../../../light";
import { useQueryClient, useRequest, type Request } from "../../../shared/data";
import { loadArchived } from "../../archived/archived-api";
import { loadCardSummary } from "../cards/cards-api";
import { loadDistribution } from "../../insights/api/distribution-api";

export { SIGN_IN } from "../../../shared/data";
export type Token = () => Promise<string | undefined>;
export const COLLECTION_KEY = ["collection", "overview"] as const;
export type Loaded = {
  /** Counts over all plants (US-BES-06); the plants themselves are read page by page (`useCardPages`). */
  summary: SpecimenSummary;
  locations: readonly LightLocation[];
  archived: readonly ArchivedEntry[];
  distribution: Distribution;
};

/** Loads the summary, locations, archive and distribution; if one fails, the loading fails as a whole (show nothing half). */
export function useCollection(api: string, token: Token): Request<Loaded> {
  const client = useQueryClient();
  const load = useCallback(
    async (t: string) => {
      const [m, s, a, v] = await Promise.all([
        loadCardSummary(api, t),
        sharedLocations(client, api, t),
        loadArchived(api, t),
        loadDistribution(api, t),
      ]);
      if (!m.ok) return m;
      if (!s.ok) return s;
      if (!a.ok) return a;
      if (!v.ok) return v;
      return {
        ok: true as const,
        value: { summary: m.value, locations: s.value, archived: a.value, distribution: v.value },
      };
    },
    [api, client],
  );
  return useRequest({ queryKey: COLLECTION_KEY, token, load });
}

export type Host = {
  onCaption: (text: string | null) => void;
  onFullView: (open: boolean) => void;
};

const plantCount = (n: number) => (n === 1 ? "1 Pflanze" : `${n} Pflanzen`);

/** Tells the host what the page shows now: the count of the list and whether a form is open (US-QS-14). */
export function useHostReport(
  host: Host | undefined,
  count: number | undefined,
  fullView: boolean,
) {
  useEffect(() => {
    host?.onCaption(count === undefined ? null : plantCount(count));
    host?.onFullView(fullView);
  }, [host, count, fullView]);
  useEffect(
    () => () => {
      host?.onCaption(null);
      host?.onFullView(false);
    },
    [host],
  );
}
