import { useEffect, useState } from "react";
import type { ArchivedEntry, SpecimenCard, LightLocation, Distribution } from "@pflanzendex/core";
import { loadLocations } from "../light";
import type { ApiError } from "../kernel";
import { loadArchived } from "./archived-api";
import { loadCards } from "./cards-api";
import { loadDistribution } from "./distribution-api";

export type Token = () => Promise<string | undefined>;
export const SIGN_IN: ApiError = {
  code: "access.not_signed_in",
  text: "Bitte melde dich neu an.",
};
export type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | {
      kind: "da";
      cards: readonly SpecimenCard[];
      locations: readonly LightLocation[];
      archived: readonly ArchivedEntry[];
      distribution: Distribution;
    };

/** Loads cards, locations and archive; if one fails, the loading fails as a whole (show nothing half). */
export function useCollection(api: string, token: Token, reload: number): Data {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return current && setData({ kind: "error", error: SIGN_IN });
      const [e, s, a, v] = await Promise.all([
        loadCards(api, t),
        loadLocations(api, t),
        loadArchived(api, t),
        loadDistribution(api, t),
      ]);
      if (!current) return;
      if (!e.ok) return setData({ kind: "error", error: e.error });
      if (!s.ok) return setData({ kind: "error", error: s.error });
      if (!a.ok) return setData({ kind: "error", error: a.error });
      if (!v.ok) return setData({ kind: "error", error: v.error });
      setData({
        kind: "da",
        cards: e.value,
        locations: s.value,
        archived: a.value,
        distribution: v.value,
      });
    })();
    return () => {
      current = false;
    };
  }, [api, token, reload]);
  return data;
}
