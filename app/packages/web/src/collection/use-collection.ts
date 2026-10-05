import type { ArchivedEntry, SpecimenCard, LightLocation, Distribution } from "@pflanzendex/core";
import { useCallback } from "react";
import { loadLocations } from "../light";
import { useRequest, type Request } from "../kernel";
import { loadArchived } from "./archived-api";
import { loadCards } from "./cards-api";
import { loadDistribution } from "./distribution-api";

export { SIGN_IN } from "../kernel";
export type Token = () => Promise<string | undefined>;
export const COLLECTION_KEY = ["collection", "overview"] as const;
export type Loaded = {
  cards: readonly SpecimenCard[];
  locations: readonly LightLocation[];
  archived: readonly ArchivedEntry[];
  distribution: Distribution;
};

/** Loads cards, locations, archive and distribution; if one fails, the loading fails as a whole (show nothing half). */
export function useCollection(api: string, token: Token): Request<Loaded> {
  const load = useCallback(
    async (t: string) => {
      const [e, s, a, v] = await Promise.all([
        loadCards(api, t),
        loadLocations(api, t),
        loadArchived(api, t),
        loadDistribution(api, t),
      ]);
      if (!e.ok) return e;
      if (!s.ok) return s;
      if (!a.ok) return a;
      if (!v.ok) return v;
      return {
        ok: true as const,
        value: { cards: e.value, locations: s.value, archived: a.value, distribution: v.value },
      };
    },
    [api],
  );
  return useRequest({ queryKey: COLLECTION_KEY, token, load });
}
