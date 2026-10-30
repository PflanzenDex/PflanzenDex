import { useCallback, type ReactNode } from "react";
import { useRequest } from "../../../kernel";
import { loadWateringDue } from "../reminders-api";

export const WATERING_KEY = ["monitoring", "watering"] as const;

/** How many plants are due for watering (US-QS-18): the request and key of the list, so both share one copy. */
export function useDueCount(api: string, token: () => Promise<string | undefined>) {
  const load = useCallback((t: string) => loadWateringDue(api, t), [api]);
  const r = useRequest({ queryKey: WATERING_KEY, token, load });
  return { status: r.status, count: r.value?.length };
}

export type DueCount = ReturnType<typeof useDueCount>;

/** Hands the count to `children` (US-QS-18); see `WateringList` (`count`). */
export function DueCountOf(props: {
  api: string;
  token: () => Promise<string | undefined>;
  children: (due: DueCount) => ReactNode;
}) {
  return <>{props.children(useDueCount(props.api, props.token))}</>;
}
