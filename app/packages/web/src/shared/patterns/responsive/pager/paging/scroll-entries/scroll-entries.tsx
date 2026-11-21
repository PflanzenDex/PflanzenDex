import * as React from "react";
import { cn } from "@/shared/lib/utils";
import {
  EntryPlaceholders,
  PagingNote,
  busyWhile,
  placeholderCount,
  usePagingMore,
  useRetryFocus,
  type PagerPaging,
} from "../paging";

/** How far below the end of the list the next part is asked for, before the keeper reaches it (SG-LIST-01, starting value, assumption). */
const MORE_MARGIN_PX = 240;

export type ScrollEntriesProps<T> = {
  items: readonly T[];
  /** Entries asked for past the loaded ones in one step; the server part decides how many arrive. */
  pageSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key of an item; defaults to its index. */
  getKey?: (item: T, index: number) => React.Key;
  /** Accessible name of the list (German). */
  label: string;
  /** Classes of the list, e.g. a grid of tiles; the default is a column. */
  listClassName?: string;
  /** A changed value (filter, search) starts again at the first part: what was asked for is forgotten. */
  resetKey?: string | number | undefined;
  /** Inside a frame that fills one screen, the list scrolls within the frame. */
  fit?: boolean;
  /** The entries live on the server in parts (FR-BES-23): the next part is asked for when the end shows, see `PagerPaging`. */
  paging?: PagerPaging;
};

type Reach = {
  paged: boolean;
  loaded: number;
  count: number;
  pageSize: number;
  fit: boolean;
  resetKey: string | number | undefined;
};

/**
 * The entries the keeper has come near to, counted past the loaded ones: asking for them asks for the next part. It is
 * kept with the key it was asked under, so a changed filter starts at nothing in the same render (no skeletons of the old
 * part). The last entry stands for the end: when it comes near the window, or near the edge of a fit list's own scroll box
 * (the root is that box, else the margin would only reach past the window), the next part is asked for. A list without
 * entries asks for nothing; without an IntersectionObserver every part is asked for at once.
 */
function useWanted(list: React.RefObject<HTMLUListElement | null>, reach: Reach): number {
  const { paged, loaded, count, pageSize, fit, resetKey } = reach;
  const [asked, setAsked] = React.useState({ key: resetKey, wanted: 0 });
  React.useEffect(() => {
    if (!paged) return;
    const ask = () => setAsked({ key: resetKey, wanted: Math.min(count, loaded + pageSize) });
    if (typeof IntersectionObserver !== "function") {
      ask();
      return;
    }
    const box = list.current;
    const node = box?.lastElementChild;
    if (!box || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) ask();
      },
      { root: fit ? box : null, rootMargin: `${MORE_MARGIN_PX}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list, paged, loaded, count, pageSize, fit, resetKey]);
  return asked.key === resetKey ? asked.wanted : 0;
}

/**
 * One scrolling list on a phone (SG-LIST-01, US-QS-32): every loaded entry stays on the list, with no "Zurück" and
 * "Weiter". With server paging the next part is asked for once the end of the list comes near, so the list loads more as
 * the keeper scrolls; without an IntersectionObserver every part is asked for at once. A failed part shows its note and
 * its retry (P-10). A list that fills its frame (`fit`) takes the room the frame leaves and scrolls in its own box, so it
 * is a tab stop for the keyboard (WCAG 2.1.1, axe scrollable-region-focusable). It never gets shorter than one row and a
 * bit (`min-h-24`, in rem, so it follows the text size): where the frame has no room left (200 % text), the frame scrolls
 * instead and the list does not collapse to nothing. Its rows never shrink below their content: a group clips its rows
 * (`overflow-hidden`), which would let a flex column squeeze them to nothing.
 */
export function ScrollEntries<T>({
  items,
  pageSize,
  renderItem,
  getKey,
  label,
  listClassName,
  resetKey,
  fit = false,
  paging,
}: ScrollEntriesProps<T>) {
  const paged = paging !== undefined;
  const loaded = items.length;
  const count = paging ? Math.max(paging.total, loaded) : loaded;
  const list = React.useRef<HTMLUListElement>(null);
  const wanted = useWanted(list, { paged, loaded, count, pageSize, fit, resetKey });
  const missing = usePagingMore(paging, loaded, wanted, count);
  const note = useRetryFocus(paging, missing, list);

  const holes = placeholderCount(paging, missing, Math.min(wanted, count) - loaded);

  return (
    <div className={cn("flex flex-col gap-3", fit && "min-h-24 flex-1")}>
      <ul
        ref={list}
        {...(fit ? { "data-page-fit": "", tabIndex: 0 } : {})}
        aria-label={label}
        {...busyWhile(holes)}
        className={cn(
          "flex flex-col gap-2",
          fit && "min-h-24 flex-1 content-start overflow-y-auto [&>li]:shrink-0",
          listClassName,
        )}
      >
        {items.map((item, i) => (
          <li key={getKey ? getKey(item, i) : i} className="shrink-0">
            {renderItem(item, i)}
          </li>
        ))}
        <EntryPlaceholders count={holes} from={loaded} paging={paging} />
      </ul>
      {note ? <PagingNote paging={note} missing={missing} /> : null}
    </div>
  );
}
