import type { ReactNode } from "react";
import { EmptyState, type EmptyStateAction } from "@/components/shared/empty-state";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import type { Response } from "./api";
import { useRequest } from "./request/use-request";
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
  /** Skeleton that mirrors the page while it loads (DS-52); it must carry the single `role="status"` with `loadingText`. */
  loadingFallback?: ReactNode;
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
  const { queryKey, token, load, empty, fresh } = props;
  const r = useRequest({ queryKey, token, load, ...(fresh ? { fresh } : {}) });
  const isEmpty = r.status === "ready" && r.value !== undefined && empty?.isEmpty(r.value);
  return (
    <RequestState
      status={isEmpty ? "empty" : r.status}
      {...(r.error ? { errorText: r.error.text } : {})}
      onRetry={r.retry}
      skeleton={props.loadingFallback ?? <p role="status">{props.loadingText}</p>}
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
