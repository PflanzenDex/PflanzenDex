import { useCallback, useEffect } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { ApiError, Response } from "../../api";
import { NETWORK_DOWN, RequestFailure } from "./query-client";
import { SIGN_IN } from "../../write-action/use-write-action";
import type { RequestStatus } from "@/shared/patterns/states/request-state/request-state";

type Token = () => Promise<string | undefined>;

export type Request<T> = {
  status: Exclude<RequestStatus, "empty">;
  value: T | undefined;
  error: ApiError | undefined;
  /** The network is down and `value` is the last loaded copy. */
  offline: boolean;
  /**
   * `value` is the copy of a previous key (`keepPrevious`) while the new key is still loading: it stays on screen, and a
   * view that shows it must also say that a new answer is on its way (US-QS-07). A background refetch of the same key
   * does not set it (react-query's `isPlaceholderData`, not `isFetching`).
   */
  placeholder: boolean;
  /**
   * `value` is on screen while a newer answer of the same key is on its way (a refetch, react-query's `isFetching`).
   * A view that decides on a copy of an earlier visit waits for the answer before it trusts the copy (issue 1795).
   */
  refreshing: boolean;
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
  /** A fresh copy is shown without a request: reference data (`REFERENCE_STALE_TIME`, issue 1244), or one key read by several parts of a screen (`SCREEN_STALE_TIME`, issue 1291). */
  staleTime?: number;
}): Request<T> {
  const { queryKey, token, load, fresh, enabled, keepPrevious, staleTime } = props;
  const q = useQuery({
    queryKey,
    ...(fresh ? { gcTime: 0 } : {}),
    ...(enabled === undefined ? {} : { enabled }),
    ...(staleTime === undefined ? {} : { staleTime }),
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
  return {
    status,
    value: q.data,
    error: failure,
    offline,
    placeholder: q.isPlaceholderData,
    // A getter: react-query tracks `isFetching` only for a view that reads `refreshing`, so the other views are not
    // re-rendered when a refetch starts or ends (NFR-12). Copying the object (`{ ...request }`) would read it.
    get refreshing() {
      return q.isFetching && q.data !== undefined;
    },
    retry,
  };
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

/** A list read in pages (FR-BES-23): the pages loaded so far and the state of the next one. */
export type PagesRequest<P> = {
  /** The first page decides: "pending" until it is there, "error" when it failed (the view fails as a whole, P-10). */
  status: "pending" | "error" | "ready";
  /** The failure: of the first page, or of a further one while the loaded pages stay on screen (P-10). */
  error: ApiError | undefined;
  pages: readonly P[];
  hasMore: boolean;
  /** A further page is on its way. */
  loadingMore: boolean;
  /** Asks for the next page; nothing happens while one is on its way or none follows. */
  loadMore: () => void;
  /** A failed further page continues from the same cursor; a failed first page is read again. */
  retry: () => void;
};

const NO_PAGES: readonly never[] = [];

/**
 * A list read in pages (FR-BES-23, NFR-12): `load` answers the page after `after` (`undefined` for the first page), and
 * `next` of a page is the cursor of the following one, `null` on the last. A failed further page keeps the loaded pages
 * (P-10); mutations invalidate by `queryKey` prefix like `useRequest`, so the pages refresh with the rest.
 */
export function useRequestPages<P extends { next: string | null }>(props: {
  queryKey: QueryKey;
  token: Token;
  load: (token: string, after: string | undefined) => Promise<Response<P>>;
  enabled?: boolean;
}): PagesRequest<P> {
  const { queryKey, token, load, enabled } = props;
  const q = useInfiniteQuery({
    queryKey,
    ...(enabled === undefined ? {} : { enabled }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const t = await token();
      if (!t) throw new RequestFailure(SIGN_IN);
      const r = await load(t, pageParam ?? undefined);
      if (!r.ok) throw new RequestFailure(r.error);
      return r.value;
    },
    getNextPageParam: (last) => last.next,
  });
  const failure = q.error instanceof RequestFailure ? q.error.error : undefined;
  const hasData = q.data !== undefined;
  return {
    status: hasData ? "ready" : q.isError ? "error" : "pending",
    error: failure,
    pages: q.data?.pages ?? NO_PAGES,
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    },
    retry: () => void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch()),
  };
}
