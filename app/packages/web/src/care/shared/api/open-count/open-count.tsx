import { useCallback, type ReactNode } from "react";
import { useRequest } from "../../../../kernel";
import { loadOpenTreatments } from "../treatments-api";
import { OPEN_KEY } from "../query-keys";

export type OpenCount = {
  status: "pending" | "ready" | "error";
  /** Open treatments; `undefined` until loaded. */
  count: number | undefined;
  /** Of those, the overdue ones. */
  urgent: number | undefined;
};

/**
 * How many treatments are open (US-QS-18): the same request and key as the list, so the overview of "Heute" and the
 * layer share one copy and a tick-off updates both.
 */
export function useOpenCount(api: string, token: () => Promise<string | undefined>): OpenCount {
  const load = useCallback((t: string) => loadOpenTreatments(api, t), [api]);
  const r = useRequest({ queryKey: OPEN_KEY, token, load });
  return {
    status: r.status,
    count: r.value?.length,
    urgent: r.value?.filter((row) => row.status.kind === "overdue").length,
  };
}

/** Hands the count to `children` (US-QS-18); see `TreatmentsPage` (`count`). */
export function OpenCount(props: {
  api: string;
  token: () => Promise<string | undefined>;
  children: (open: OpenCount) => ReactNode;
}) {
  return <>{props.children(useOpenCount(props.api, props.token))}</>;
}
