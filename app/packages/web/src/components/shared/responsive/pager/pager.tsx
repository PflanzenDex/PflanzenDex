import * as React from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

/** Horizontal distance of a swipe that turns the page (starting value, assumption; US-QS-15). */
const SWIPE_PX = 48;
const PARAM = "page";

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

/** "Zurück", the position and "Weiter" (US-QS-15). */
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
      <Button type="button" variant="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
        Zurück
      </Button>
      <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
        Seite {page} von {pages}
      </p>
      <Button type="button" variant="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
        Weiter
      </Button>
    </div>
  );
}

export type PagerProps<T> = {
  items: readonly T[];
  /** Whole entries per page; the caller sizes it to its region. */
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
};

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Pages of whole entries instead of a long scroll (US-QS-15, DS-58): "Zurück" and "Weiter", the position "Seite n von m"
 * in a polite live region, swipe as an alternative. The page is in the address (`?page=n`, 1-based); a page outside the
 * range shows the nearest valid one. Pages change without sliding, so reduced motion needs nothing extra.
 */
export function Pager<T>({
  items,
  pageSize,
  renderItem,
  getKey,
  label,
  listClassName,
  resetKey,
}: PagerProps<T>) {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const raw = parsePage(params.get(PARAM));
  const page = Math.min(raw, pages);

  const go = React.useCallback(
    (target: number, replace = false) => {
      const next = new URLSearchParams(params);
      if (target <= 1) next.delete(PARAM);
      else next.set(PARAM, String(target));
      setParams(next, { replace });
    },
    [params, setParams],
  );

  // A page outside the range is corrected in the address as well.
  React.useEffect(() => {
    if (params.has(PARAM) && raw !== page) go(page, true);
  }, [params, raw, page, go]);

  const lastKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    if (params.has(PARAM)) go(1, true);
  }, [resetKey, params, go]);

  const swipe = useSwipe(page, pages, go);
  const visible = items.slice((page - 1) * pageSize, page * pageSize);
  const first = (page - 1) * pageSize;

  return (
    <div className="flex flex-col gap-3 [touch-action:pan-y]" {...swipe}>
      <ul aria-label={label} className={cn("flex flex-col gap-2", listClassName)}>
        {visible.map((item, i) => (
          <li key={getKey ? getKey(item, first + i) : first + i}>{renderItem(item, first + i)}</li>
        ))}
      </ul>
      {pages > 1 ? <PagerBar page={page} pages={pages} go={go} /> : null}
    </div>
  );
}
