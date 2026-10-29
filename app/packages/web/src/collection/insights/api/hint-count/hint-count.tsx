import { useCallback, type ReactNode } from "react";
import { loadLocations } from "../../../../light";
import { useRequest } from "../../../../kernel";
import { loadSpecimenHints } from "../hints-api";

export const HINTS_KEY = ["collection", "hints"] as const;

/**
 * How many hints about incomplete specimens exist (US-QS-18): the request and key of the list (`HintsPage` loads the
 * locations with them), so the overview of "Heute" and the layer share one copy.
 */
export function useHintCount(api: string, token: () => Promise<string | undefined>) {
  const load = useCallback(
    async (t: string) => {
      const [hints, locations] = await Promise.all([
        loadSpecimenHints(api, t),
        loadLocations(api, t),
      ]);
      if (!hints.ok) return hints;
      if (!locations.ok) return locations;
      return { ok: true as const, value: { hints: hints.value, locations: locations.value } };
    },
    [api],
  );
  const r = useRequest({ queryKey: HINTS_KEY, token, load });
  return { status: r.status, count: r.value?.hints.length };
}

/**
 * Hands the count to `children` (US-QS-18). A component and not a hook in the module interface, so the request code
 * loads with "Heute" and not with the shell (QG-U6).
 */
export function HintCount(props: {
  api: string;
  token: () => Promise<string | undefined>;
  children: (hints: ReturnType<typeof useHintCount>) => ReactNode;
}) {
  return <>{props.children(useHintCount(props.api, props.token))}</>;
}
