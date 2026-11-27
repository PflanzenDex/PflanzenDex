import { useCallback, useMemo } from "react";
import { useRequest } from "../../shared/data";
import { loadOwnership, OWNERSHIP_KEY } from "./ownership-api";

/**
 * The ids of the catalog species the account has caught (US-POK-06), for the quick filter "Noch nicht gefangen" of the
 * catalog (US-QS-15, US-QS-21, owner decision d-166, issue 2587): the app reads them here and hands them to `catalog`, which
 * does not know `pokedex`. `null` while the ownership loads or when it failed: what is not known is never guessed (P-08, P-10).
 * It reads the key of the species page, so both share one copy.
 */
export function useCaughtSpeciesIds(
  api: string,
  token: () => Promise<string | undefined>,
): ReadonlySet<string> | null {
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  const ownership = useRequest({ queryKey: OWNERSHIP_KEY, token, load });
  const caught = ownership.status === "ready" ? ownership.value?.caught : undefined;
  return useMemo(() => (caught ? new Set(caught.map((c) => c.speciesId)) : null), [caught]);
}
