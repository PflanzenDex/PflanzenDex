import { useCallback, useMemo } from "react";
import { useRequest } from "../../shared/data";
import { loadOwnership, OWNERSHIP_KEY } from "./ownership-api";

/**
 * What the app hands to the catalog (the shape of `QuickFilters` there, which `pokedex` does not import): `caught` holds
 * the ids of the species the account has caught, or `null` while they load or when the load failed; `loading` tells the
 * two apart (US-QS-15, issue 2615). A view that waits (`loading`) stays quiet, one that failed (`caught` null, not loading)
 * says so.
 */
type CaughtSpeciesIds = { caught: ReadonlySet<string> | null; loading: boolean };

/**
 * The ids of the catalog species the account has caught (US-POK-06), for the quick filter "Noch nicht gefangen" of the
 * catalog (US-QS-15, US-QS-21, owner decision d-166, issues 2587 and 2615): the app reads them here and hands them to `catalog`,
 * which does not know `pokedex`. `caught` is `null` while the ownership loads (`loading` true) and when it failed (`loading`
 * false): what is not known is never guessed (P-08, P-10). The value keeps its identity while nothing changes, so a list
 * does not filter again for nothing. It reads the key of the species page, so both share one copy.
 */
export function useCaughtSpeciesIds(
  api: string,
  token: () => Promise<string | undefined>,
): CaughtSpeciesIds {
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  const ownership = useRequest({ queryKey: OWNERSHIP_KEY, token, load });
  const caught = ownership.status === "ready" ? ownership.value?.caught : undefined;
  const loading = ownership.status === "pending";
  return useMemo(
    () => ({ caught: caught ? new Set(caught.map((c) => c.speciesId)) : null, loading }),
    [caught, loading],
  );
}
