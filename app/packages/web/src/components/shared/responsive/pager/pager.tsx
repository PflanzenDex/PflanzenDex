import * as React from "react";
import { useLocation, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { pageAfterResize, usePageFit } from "./use-page-fit";

/** Horizontal distance of a swipe that turns the page (starting value, assumption; US-QS-15). */
const SWIPE_PX = 48;
const PARAM = "page";
/** The address part of the pages of a list inside a layer, so it does not compete with the screen behind it (US-QS-22). */
export const LAYER_PARAM = "lpage";

/** Pointer handlers that turn a horizontal swipe into a page change, as an alternative to the buttons. */
function useSwipe(page: number, pages: number, go: (target: number) => void) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && page < pages) go(page + 1);
      if (dx > 0 && page > 1) go(page - 1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

/**
 * A disabled page button keeps its text and border neutral: the outline green at half opacity fell to about 1.8:1
 * (issue 1045). It is still disabled and shows no action (DS-39, DS-65).
 */
const DISABLED_PAGE_BUTTON =
  "disabled:border-border disabled:text-muted-foreground disabled:opacity-100";

/** "Zurück", the position and "Weiter" (US-QS-15). The caption never wraps: a page number and its count stay together (US-QS-24). */
function PagerBar({
  page,
  pages,
  go,
}: {
  page: number;
  pages: number;
  go: (target: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        className={DISABLED_PAGE_BUTTON}
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        Zurück
      </Button>
      <p
        role="status"
        aria-live="polite"
        className="whitespace-nowrap text-sm tabular-nums text-muted-foreground"
      >
        Seite {page} von {pages}
      </p>
      <Button
        type="button"
        variant="outline"
        className={DISABLED_PAGE_BUTTON}
        disabled={page >= pages}
        onClick={() => go(page + 1)}
      >
        Weiter
      </Button>
    </div>
  );
}

export type PagerProps<T> = {
  items: readonly T[];
  /**
   * Whole entries per page. Without `fit` the caller sizes it to its region; with `fit` it is the starting value until
   * the layout measures the region.
   */
  pageSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key of an item; defaults to its index. */
  getKey?: (item: T, index: number) => React.Key;
  /** Accessible name of the list (German). */
  label: string;
  /** Classes of the list, e.g. a grid of tiles; the default is a column. */
  listClassName?: string;
  /** A changed value (filter, search) starts again at page 1. */
  resetKey?: string | number;
  /** Name of the address part that holds the page; `page` unless another pager shares the address (a list in a layer passes `LAYER_PARAM`). */
  param?: string;
  /** Replaces the history entry instead of pushing one, so Back leaves a layer in one step. */
  replace?: boolean;
  /**
   * The page size is the free height of the list region: the whole rows that fit, times the columns of a grid, measured
   * in the layout (US-QS-19, issue 1029). The region must be sized by its frame (flex-1, min-h-0 up to the frame), and
   * the pager sits below it at the bottom of that frame.
   */
  fit?: boolean;
};

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The page in the address: the current one, and `go` to write another. Keeps the history state, so a layer closes by going back (`useLayer`). */
function usePageAddress(param: string, replaceEntry: boolean) {
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

/**
 * Pages of whole entries instead of a long scroll (US-QS-15, DS-58): "Zurück" and "Weiter", the position "Seite n von m"
 * in a polite live region, swipe as an alternative. The page is in the address (`?page=n`, 1-based); a page outside the
 * range shows the nearest valid one. Pages change without sliding, so reduced motion needs nothing extra.
 */
export function Pager<T>({
  items,
  pageSize: startingSize,
  renderItem,
  getKey,
  label,
  listClassName,
  resetKey,
  param = PARAM,
  replace: replaceEntry = false,
  fit = false,
}: PagerProps<T>) {
  const { params, go } = usePageAddress(param, replaceEntry);
  const list = React.useRef<HTMLUListElement>(null);
  const fitted = usePageFit(list, fit);
  const measured = fitted?.size ?? null;
  const pageSize = measured ?? startingSize;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const raw = parsePage(params.get(param));
  const page = Math.min(raw, pages);

  // The address follows the page (see pageAfterResize, issue 1029). Passive, not a layout effect: the router subscribes to
  // the address in its own layout effect, after the children's, so a navigation made earlier would be lost on mount.
  const measuredBefore = React.useRef<number | null>(null);
  React.useEffect(() => {
    const before = measuredBefore.current;
    measuredBefore.current = measured;
    if (fit && measured === null) return; // no layout yet: the starting value must not rewrite the address
    const target = pageAfterResize({ before, measured, raw, count: items.length, page });
    if (params.has(param) && raw !== target) go(target, true);
  });

  const lastKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    if (params.has(param)) go(1, true);
  }, [resetKey, params, go, param]);

  const swipe = useSwipe(page, pages, go);
  const visible = items.slice((page - 1) * pageSize, page * pageSize);
  const first = (page - 1) * pageSize;

  return (
    <div
      className={cn("flex flex-col gap-3 [touch-action:pan-y]", fit && "min-h-0 flex-1")}
      {...swipe}
    >
      <ul
        ref={list}
        style={fitted ? { minHeight: fitted.rowHeight } : undefined}
        aria-label={label}
        className={cn("flex flex-col gap-2", fit && "min-h-0 flex-1 content-start", listClassName)}
      >
        {visible.map((item, i) => (
          <li key={getKey ? getKey(item, first + i) : first + i}>{renderItem(item, first + i)}</li>
        ))}
      </ul>
      {pages > 1 ? <PagerBar page={page} pages={pages} go={go} /> : null}
    </div>
  );
}
