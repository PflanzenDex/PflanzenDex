import type { ReactNode } from "react";
import {
  EmptyState,
  type EmptyStateAction,
} from "@/shared/patterns/elements/empty-state/empty-state";
import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import type { Response } from "../../api";
import { useRequest } from "../request/use-request";
import type { QueryKey } from "@tanstack/react-query";

/**
 * Loads one thing for a page on the data layer and shows what the user needs while it is not there (DS-09, DS-26):
 * the skeleton while loading, the error with "Erneut versuchen" if it fails (P-09, P-10), the empty state when there
 * are no rows, the content when loaded; when the network is down the last loaded copy with a note (US-QS-07). Without
 * a token nothing is queried. `queryKey` names the data; a write refreshes it with `useInvalidate`.
 */
export function LoadFrame<T>(props: {
  queryKey: QueryKey;
  token: () => Promise<string | undefined>;
  load: (token: string) => Promise<Response<T>>;
  loadingText: string;
  /** The data fills a form: it is not kept after the view closes (see `useRequest`). */
  fresh?: boolean;
  /** One key read by several parts of a screen: a fresh copy is shown without a second request (see `useRequest`). */
  staleTime?: number;
  /** Skeleton that mirrors the page while it loads (DS-52); it must carry the single `role="status"` with `loadingText`. */
  loadingFallback?: ReactNode;
  /**
   * A shapeless status instead of a skeleton: a centred text without a shape (US-QS-14, D5, issue 1772), held once it has
   * shown. It carries the single `role="status"` itself. Without it and without `loadingFallback` a `PlantLoader` shows.
   */
  loadingStatus?: ReactNode;
  /** Optional empty state for a view that has nothing to show without rows. */
  empty?: {
    isEmpty: (value: T) => boolean;
    title: string;
    description?: string;
    action?: EmptyStateAction;
  };
  /** Page level only: the main heading shown when the load fails (US-QS-09). */
  heading?: string;
  children: (value: T) => ReactNode;
}) {
  const { queryKey, token, load, empty, fresh, staleTime } = props;
  const r = useRequest({
    queryKey,
    token,
    load,
    ...(fresh ? { fresh } : {}),
    ...(staleTime === undefined ? {} : { staleTime }),
  });
  const isEmpty = r.status === "ready" && r.value !== undefined && empty?.isEmpty(r.value);
  return (
    <RequestState
      status={isEmpty ? "empty" : r.status}
      {...(r.error ? { errorText: r.error.text } : {})}
      onRetry={r.retry}
      skeleton={props.loadingFallback}
      loader={
        props.loadingStatus ?? (
          <PlantLoader label={props.loadingText} size="lg" className="mx-auto my-8 flex" />
        )
      }
      empty={
        empty ? (
          <EmptyState
            title={empty.title}
            {...(empty.description ? { description: empty.description } : {})}
            {...(empty.action ? { action: empty.action } : {})}
          />
        ) : null
      }
      offline={r.offline}
      {...(props.heading ? { heading: props.heading } : {})}
    >
      {r.value !== undefined ? props.children(r.value) : null}
    </RequestState>
  );
}
