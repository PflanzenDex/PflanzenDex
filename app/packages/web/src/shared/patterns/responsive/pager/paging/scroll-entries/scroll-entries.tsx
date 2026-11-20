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
  /** Inside a frame that fills one screen, the list scrolls within the frame. */
  fit?: boolean;
  /** The entries live on the server in parts (FR-BES-23): the next part is asked for when the end shows, see `PagerPaging`. */
  paging?: PagerPaging;
};

/**
 * One scrolling list on a phone (SG-LIST-01, US-QS-32): every loaded entry stays on the list, with no "Zurück" and
 * "Weiter". With server paging the next part is asked for once the end of the list comes near, so the list loads more as
 * the keeper scrolls; without an IntersectionObserver every part is asked for at once. A failed part shows its note and
 * its retry (P-10).
 */
export function ScrollEntries<T>({
  items,
  pageSize,
  renderItem,
  getKey,
  label,
  listClassName,
  fit = false,
  paging,
}: ScrollEntriesProps<T>) {
  const paged = paging !== undefined;
  const loaded = items.length;
  const count = paging ? Math.max(paging.total, loaded) : loaded;
  // The entries the keeper has come near to, counted past the loaded ones: asking for them asks for the next part.
  const [wanted, setWanted] = React.useState(0);
  const list = React.useRef<HTMLUListElement>(null);
  const missing = usePagingMore(paging, loaded, wanted, count);
  const note = useRetryFocus(paging, missing, list);

  React.useEffect(() => {
    if (!paged) return;
    const ask = () => setWanted(Math.min(count, loaded + pageSize));
    if (typeof IntersectionObserver !== "function") {
      ask();
      return;
    }
    // The last entry stands for the end: when it comes near the screen, or near the edge of a fit list's own scroll area,
    // the next part is asked for. A list without entries asks for nothing.
    const node = list.current?.lastElementChild;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) ask();
      },
      { rootMargin: `${MORE_MARGIN_PX}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [paged, loaded, count, pageSize]);

  const holes = placeholderCount(paging, missing, Math.min(wanted, count) - loaded);

  return (
    <div className={cn("flex flex-col gap-3", fit && "min-h-0 flex-1")}>
      <ul
        ref={list}
        {...(fit ? { "data-page-fit": "" } : {})}
        aria-label={label}
        {...busyWhile(holes)}
        className={cn(
          "flex flex-col gap-2",
          fit && "min-h-0 flex-1 content-start overflow-y-auto",
          listClassName,
        )}
      >
        {items.map((item, i) => (
          <li key={getKey ? getKey(item, i) : i}>{renderItem(item, i)}</li>
        ))}
        <EntryPlaceholders count={holes} from={loaded} paging={paging} />
      </ul>
      {note ? <PagingNote paging={note} missing={missing} /> : null}
    </div>
  );
}
