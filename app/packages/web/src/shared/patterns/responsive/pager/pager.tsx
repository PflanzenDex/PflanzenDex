import * as React from "react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { usePageFit } from "./use-page-fit";
import {
  PAGE_PARAM,
  hasOldPart,
  namedEntry,
  pagedIn,
  position,
  type PagerPart,
} from "./paging/address";
import {
  PagingNote,
  usePageAddress,
  usePagingMore,
  useFirstEntryWrite,
  useResetPage,
  useRetryFocus,
  type PagerPaging,
} from "./paging/paging";

export type { PagerPaging } from "./paging/paging";
export type { PagerPart } from "./paging/address";
export { LAYER_PARAM, PAGE_PARAM, dropPageParts } from "./paging/address";

/** Horizontal distance of a swipe that turns the page (starting value, assumption; US-QS-15). */
const SWIPE_PX = 48;

/** Pointer handlers that turn a horizontal swipe into a page change, as an alternative to the buttons. */
function useSwipe(page: number, pages: number, turn: (delta: 1 | -1) => void) {
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
      if (dx < 0 && page < pages) turn(1);
      if (dx > 0 && page > 1) turn(-1);
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
  turn,
}: {
  page: number;
  pages: number;
  turn: (delta: 1 | -1) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        className={DISABLED_PAGE_BUTTON}
        disabled={page <= 1}
        onClick={() => turn(-1)}
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
        onClick={() => turn(1)}
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
  /** A changed value (filter, search) starts again at the first entry. */
  resetKey?: string | number;
  /**
   * Name of the address part that holds the first entry; `from` unless another pager shares the address (a list in a layer
   * passes `LAYER_PARAM`). Only the parts of `PAGER_PARTS` are accepted, so `RouteFocus` knows each one (issue 1550).
   */
  param?: PagerPart;
  /** Replaces the history entry instead of pushing one, so Back leaves a layer in one step. */
  replace?: boolean;
  /**
   * The page size is the free height of the list region: the whole rows that fit, times the columns of a grid, measured
   * in the layout (US-QS-19, issue 1029). The region is sized by its frame (flex-1), and the pager sits below it at the
   * bottom of that frame; the frame's room that the content does not take is the free height (issue 1413). The list
   * carries `data-page-fit`, so a layer takes its full height (issue 1156).
   */
  fit?: boolean;
  /** The entries live on the server in pages (FR-BES-23): the pages count from its total, see `PagerPaging`. */
  paging?: PagerPaging;
};

/**
 * Pages of whole entries instead of a long scroll (US-QS-15, DS-58): "Zurück" and "Weiter", the position "Seite n von m"
 * in a polite live region, swipe as an alternative. The address names the first entry on screen (`?from=n`, counted from
 * 0, FR-BES-23): a page size differs per screen, so only an entry means the same plants everywhere. A step of the person
 * writes it; a resize writes nothing; an entry past the end shows the last page and the address follows. An old page
 * number (`?page=n`) is converted once, at the first measurement, and then the address holds the entry.
 */
export function Pager<T>({
  items,
  pageSize: startingSize,
  renderItem,
  getKey,
  label,
  listClassName,
  resetKey,
  param = PAGE_PARAM,
  replace: replaceEntry = false,
  fit = false,
  paging,
}: PagerProps<T>) {
  const { params, go } = usePageAddress(param, replaceEntry);
  const list = React.useRef<HTMLUListElement>(null);
  const fitted = usePageFit(list, fit);
  const measured = fitted?.size ?? null;
  const size = measured ?? startingSize;
  // The entries of the list: all of them on the server (`paging.total`), at least the loaded ones.
  const count = paging ? Math.max(paging.total, items.length) : items.length;
  const named = namedEntry(params, param, size);
  const { first, page, pages } = position({ from: named, size, count });
  const missing = usePagingMore(paging, items.length, first + size, count);
  const note = useRetryFocus(paging, missing, list);
  // The address names the first entry (FR-BES-23, issue 1492); a fit list writes nothing before its layout.
  useFirstEntryWrite(go, { first, named, old: hasOldPart(params, param), fit, measured });
  useResetPage(resetKey, pagedIn(params, param), go);
  const turn = (delta: 1 | -1) => go(Math.max(0, first + delta * size));
  const swipe = useSwipe(page, pages, turn);

  return (
    <div
      className={cn("flex flex-col gap-3 [touch-action:pan-y]", fit && "min-h-0 flex-1")}
      {...swipe}
    >
      <ul
        ref={list}
        {...(fit ? { "data-page-fit": "" } : {})}
        style={fitted ? { minHeight: fitted.rowHeight } : undefined}
        aria-label={label}
        className={cn("flex flex-col gap-2", fit && "min-h-0 flex-1 content-start", listClassName)}
      >
        {items.slice(first, first + size).map((item, i) => (
          <li key={getKey ? getKey(item, first + i) : first + i}>{renderItem(item, first + i)}</li>
        ))}
      </ul>
      {note ? <PagingNote paging={note} missing={missing} /> : null}
      {pages > 1 ? <PagerBar page={page} pages={pages} turn={turn} /> : null}
    </div>
  );
}
