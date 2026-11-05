import * as React from "react";
import { useLocation, useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button/button";

/**
 * Server paging of a list (FR-BES-23): `items` are the loaded entries, `total` all of them on the server. The pages count
 * from `total`; when the page on screen reaches beyond the loaded entries, `onMore` is asked once for the next server page
 * (never while one is on its way or after a failure). The entries that are not loaded yet show as a note, never as an
 * empty page (P-10); a failed page shows its `failure` with a button that retries from the same place.
 */
export type PagerPaging = {
  total: number;
  /** A page is on its way: the missing entries show the loading note. */
  loading: boolean;
  /** The German text of a failed page; the loaded entries stay on screen. */
  failure?: string | undefined;
  onMore: () => void;
  onRetry: () => void;
  /** German texts of the note while a page loads and of the retry button. */
  loadingText: string;
  retryText: string;
};

/** The note of the entries that are not loaded yet: the loading text, or the failure with its retry button (P-10). */
export function PagingNote({ paging }: { paging: PagerPaging }) {
  if (paging.failure === undefined)
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {paging.loadingText}
      </p>
    );
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-sm">
        {paging.failure}
      </p>
      <Button type="button" variant="outline" onClick={paging.onRetry}>
        {paging.retryText}
      </Button>
    </div>
  );
}

/**
 * Whether the page on screen reaches beyond the loaded entries. Then the next server page is asked for once, unless one is
 * on its way or has failed (P-10: the failure waits for its retry, never a loop). Returns whether entries are missing.
 */
export function usePagingMore(
  paging: PagerPaging | undefined,
  loaded: number,
  pageEnd: number,
  count: number,
): boolean {
  const missing = paging !== undefined && loaded < count && pageEnd > loaded;
  const onMore = paging?.onMore;
  const awaiting = paging?.loading === true || paging?.failure !== undefined;
  React.useEffect(() => {
    if (missing && !awaiting) onMore?.();
  }, [missing, awaiting, onMore]);
  return missing;
}

/**
 * A retry that worked takes the note and its button away, and the focus with them: it moves to the first control of the
 * list, or to the list (issue 1304, 2.4.3). A retry that failed keeps the button, and with it the focus.
 */
export function useRetryFocus(
  paging: PagerPaging | undefined,
  missing: boolean,
  list: React.RefObject<HTMLElement | null>,
): PagerPaging | undefined {
  const retried = React.useRef(false);
  React.useEffect(() => {
    if (!retried.current || missing) return;
    retried.current = false;
    const box = list.current;
    const control = box?.querySelector<HTMLElement>("a[href], button:not([disabled])");
    if (!control) box?.setAttribute("tabindex", "-1");
    (control ?? box)?.focus();
  }, [missing, list]);
  if (!paging) return undefined;
  const onRetry = () => {
    retried.current = true;
    paging.onRetry();
  };
  return { ...paging, onRetry };
}

/** A changed `resetKey` (filter, search) starts again at page 1. */
export function useResetPage(
  resetKey: string | number | undefined,
  paged: boolean,
  go: (target: number, replace?: boolean) => void,
) {
  const lastKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    if (paged) go(1, true);
  }, [resetKey, paged, go]);
}

export function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The page in the address: the current one, and `go` to write another. Keeps the history state, so a layer closes by going back (`useLayer`). */
export function usePageAddress(param: string, replaceEntry: boolean) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const go = React.useCallback(
    (target: number, replace = false) => {
      const next = new URLSearchParams(params);
      if (target <= 1) next.delete(param);
      else next.set(param, String(target));
      setParams(next, { replace: replace || replaceEntry, state: location.state });
    },
    [params, setParams, param, replaceEntry, location.state],
  );
  return { params, go };
}
