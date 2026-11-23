import * as React from "react";
import { useLocation, useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button/button";
import {
  DelayedSkeleton,
  useHeldLoader,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { OLD_PARTS } from "./address";

/**
 * Server paging of a list (FR-BES-23): `items` are the loaded entries, `total` all of them on the server. The pages count
 * from `total`; when the page on screen reaches beyond the loaded entries, `onMore` is asked once for the next server page
 * (never while one is on its way or after a failure). The entries that are not loaded yet show as a note, never as an
 * empty page (P-10); a failed page shows its `failure` with a button that retries from the same place.
 */
export type PagerPaging = {
  /** All entries on the server; absent while unknown (P-08): no end marker, no part asked past the loaded entries. */
  total?: number | undefined;
  /** A page is on its way: the missing entries show the loading note. */
  loading: boolean;
  /** The German text of a failed page; the loaded entries stay on screen. */
  failure?: string | undefined;
  onMore: () => void;
  onRetry: () => void;
  /** German texts of the note while a page loads and of the retry button. */
  loadingText: string;
  retryText: string;
  /**
   * The skeleton of one entry (SG-STATE-02, F-0124): while a page loads, each entry of the page on screen that is not there
   * yet shows it in its place (after the delay of DS-57), the list is `aria-busy` and the loading note is read out only,
   * so the page has its final shape instead of an empty frame. Without it the note shows the loading text.
   */
  placeholder?: React.ReactNode;
};

/** The entries of the list: `paging.total` and at least the loaded ones; the loaded ones while the total is unknown. */
export function knownCount(paging: PagerPaging | undefined, loaded: number): number {
  return paging ? Math.max(paging.total ?? 0, loaded) : loaded;
}

/** How many entries of the page on screen show the placeholder: the `room` left on it while its page loads, else none. */
export function placeholderCount(
  paging: PagerPaging | undefined,
  missing: boolean,
  room: number,
): number {
  const waiting = paging?.placeholder !== undefined && missing && paging.failure === undefined;
  return waiting ? Math.max(0, room) : 0;
}

/** The list is busy while placeholders stand in it (SG-STATE-02). */
export const busyWhile = (placeholders: number) => (placeholders > 0 ? { "aria-busy": true } : {});

/** The placeholders of the missing entries, as list items from entry `from` on, hidden from assistive technology. */
export function EntryPlaceholders(props: {
  count: number;
  from: number;
  paging: PagerPaging | undefined;
}) {
  return Array.from({ length: props.count }, (_, i) => (
    <li key={`placeholder-${props.from + i}`} aria-hidden="true" className="shrink-0">
      <DelayedSkeleton>{props.paging?.placeholder}</DelayedSkeleton>
    </li>
  ));
}

/**
 * The note of the entries that are not loaded yet: the loading text, or the failure with its retry button (P-10). The
 * loading text holds once shown (US-QS-14, D5, issue 1772), so the note stays mounted while the page is missing. With a
 * placeholder the missing entries show their skeletons, so the loading text is read out only and takes no room (SG-STATE-02).
 */
export function PagingNote({ paging, missing }: { paging: PagerPaging; missing: boolean }) {
  const quiet = paging.placeholder !== undefined;
  const loading = useHeldLoader(missing && paging.failure === undefined);
  if (loading)
    return (
      <DelayedSkeleton>
        <p
          role="status"
          aria-live="polite"
          className={quiet ? "sr-only" : "text-sm text-muted-foreground"}
        >
          {paging.loadingText}
        </p>
      </DelayedSkeleton>
    );
  if (!missing) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-sm">
        {paging.failure}
      </p>
      <Button type="button" variant="tinted" onClick={paging.onRetry}>
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

/** A changed `resetKey` (filter, search) starts again at the first entry. `paged`: the new or the old address part is there. */
export function useResetPage(
  resetKey: string | number | undefined,
  paged: boolean,
  go: (target: number, replace?: boolean) => void,
) {
  const lastKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    if (paged) go(0, true);
  }, [resetKey, paged, go]);
}

/**
 * Writes the first entry into the address when the address names another one, or still holds an old page number (issue
 * 1492). Passive, not a layout effect (see `Pager`).
 */
export function useFirstEntryWrite(
  go: (target: number, replace?: boolean) => void,
  {
    first,
    named,
    old,
    fit,
    measured,
  }: { first: number; named: number; old: boolean; fit: boolean; measured: number | null },
) {
  React.useEffect(() => {
    if (fit && measured === null) return; // no layout yet: the starting size must not rewrite the address
    if (old || named !== first) go(first, true);
  });
}

/**
 * The first entry in the address: the current one, and `go` to write another. `go(0)` takes the part away. Every write
 * takes the old page number of the list away too (issue 1492). Keeps the history state, so a layer closes by going back
 * (`useLayer`).
 */
export function usePageAddress(param: string, replaceEntry: boolean) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const go = React.useCallback(
    (target: number, replace = false) => {
      const next = new URLSearchParams(params);
      const old = OLD_PARTS.get(param);
      if (old !== undefined) next.delete(old);
      if (target <= 0) next.delete(param);
      else next.set(param, String(target));
      setParams(next, { replace: replace || replaceEntry, state: location.state });
    },
    [params, setParams, param, replaceEntry, location.state],
  );
  return { params, go };
}
