import { useCallback, useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ApiError, Response } from "../api";
import { NETWORK_DOWN, RequestFailure } from "./query-client";
import { SIGN_IN } from "../use-write-action";
import type { RequestStatus } from "@/components/shared/states/request-state/request-state";

type Token = () => Promise<string | undefined>;

export type Request<T> = {
  status: Exclude<RequestStatus, "empty">;
  value: T | undefined;
  error: ApiError | undefined;
  /** The network is down and `value` is the last loaded copy. */
  offline: boolean;
  retry: () => void;
};

/**
 * One request of a view on the data layer (DS-09): `load` runs with the token, a refusal becomes a visible error with
 * the code's text (P-10), without a token nothing is queried. While data is there it stays on screen when the next
 * load fails because the network is down. Mutations invalidate by `queryKey` prefix (`useInvalidate`).
 */
export function useRequest<T>(props: {
  queryKey: QueryKey;
  token: Token;
  load: (token: string) => Promise<Response<T>>;
  /** For data a form is filled from: nothing is kept after the view closes, so a form never starts from an old copy. */
  fresh?: boolean;
  /** `false` waits (for example until something is chosen): nothing is queried and the status stays pending. */
  enabled?: boolean;
  /** While the key changes (a new search text) the last result stays on screen until the new one is there. */
  keepPrevious?: boolean;
}): Request<T> {
  const { queryKey, token, load, fresh, enabled, keepPrevious } = props;
  const q = useQuery({
    queryKey,
    ...(fresh ? { gcTime: 0 } : {}),
    ...(enabled === undefined ? {} : { enabled }),
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
    queryFn: async () => {
      const t = await token();
      if (!t) throw new RequestFailure(SIGN_IN);
      const r = await load(t);
      if (!r.ok) throw new RequestFailure(r.error);
      return r.value;
    },
  });
  const failure = q.error instanceof RequestFailure ? q.error.error : undefined;
  const offline = q.data !== undefined && q.isError && failure?.code === NETWORK_DOWN;
  const retry = useCallback(() => void q.refetch(), [q]);
  const status =
    q.data !== undefined && (!q.isError || offline) ? "ready" : q.isError ? "error" : "pending";
  return { status, value: q.data, error: failure, offline, retry };
}

/** Drops every cached copy while nobody is signed in, so the next account never sees data of the last one (P-04). */
export function useClearOnSignOut(signedIn: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!signedIn) client.clear();
  }, [client, signedIn]);
}

/** Marks everything under `queryKey` stale and loads it again; resolves when the new data is there. */
export function useReload(queryKey: QueryKey): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey }), [client, queryKey]);
}

/** Like `useReload`, for callers that do not wait: lists refresh after a write without a page reload. */
export function useInvalidate(queryKey: QueryKey): () => void {
  const reload = useReload(queryKey);
  return useCallback(() => void reload(), [reload]);
}
