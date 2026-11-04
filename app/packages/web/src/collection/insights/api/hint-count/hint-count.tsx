import { useCallback, type ReactNode } from "react";
import { sharedLocations } from "../../../../light";
import { useQueryClient, useRequest } from "../../../../shared/data";
import { loadSpecimenHints } from "../hints-api";

export const HINTS_KEY = ["collection", "hints"] as const;

/**
 * How many hints about incomplete specimens exist (US-QS-18): the request and key of the list (`HintsPage` loads the
 * locations with them), so the overview of "Heute" and the layer share one copy. The locations come from their shared
 * copy (issue 1244), so going back to "Heute" asks for them only when the copy is stale.
 */
export function useHintCount(api: string, token: () => Promise<string | undefined>) {
  const client = useQueryClient();
  const load = useCallback(
    async (t: string) => {
      const [hints, locations] = await Promise.all([
        loadSpecimenHints(api, t),
        sharedLocations(client, api, t),
      ]);
      if (!hints.ok) return hints;
      if (!locations.ok) return locations;
      return { ok: true as const, value: { hints: hints.value, locations: locations.value } };
    },
    [api, client],
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
