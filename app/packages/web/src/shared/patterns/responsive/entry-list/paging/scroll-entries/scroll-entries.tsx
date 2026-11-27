import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { useInLayer } from "@/shared/ui/layer-scope";
import {
  EntryPlaceholders,
  busyWhile,
  knownCount,
  placeholderCount,
  usePagingMore,
  useRetryFocus,
  type EntriesPaging,
} from "../paging";
import { ListEnd } from "./list-end/list-end";
import { useScrollOverflow } from "./use-scroll-overflow";
import { useStripOldPositions } from "./use-strip-old-positions";

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
  /**
   * On a page the list fills its frame and scrolls in its own box. In a sheet, a dialog or a pane it has no effect: the
   * list is the content of the layer, which scrolls (issue 2418).
   */
  fit?: boolean;
  /** The entries live on the server in parts (FR-BES-23): the next part is asked for when the end shows, see `EntriesPaging`. */
  paging?: EntriesPaging;
  /**
   * The count of the end marker when it is not this list's own: the last section of a grouped list ends the whole list, so
   * it names the entries of every group (SG-LIST-01). `false` shows no marker: a section that is not the last.
   */
  end?: number | false;
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
      { root: fit ? box : box.closest("[data-scroll-region]"), rootMargin: `${MORE_MARGIN_PX}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list, paged, loaded, count, pageSize, fit, resetKey]);
  return asked.key === resetKey ? asked.wanted : 0;
}

/**
 * The count of the end marker, or nothing: the marker needs every entry, a known count and a list that is longer than its
 * box (`end` is the count of the whole grouped list for its last section, `false` for the sections before it).
 */
function endCount(c: {
  end: number | false | undefined;
  known: boolean;
  longer: boolean;
  loaded: number;
  count: number;
}): number | undefined {
  if (c.end === false || !c.known || !c.longer || c.loaded === 0) return undefined;
  return c.loaded === c.count ? (c.end ?? c.count) : undefined;
}

/**
 * One scrolling list at every width (SG-LIST-01, US-QS-15, US-QS-32): every loaded entry stays on the list, with no "Zurück" and
 * "Weiter" and no "Mehr laden". With server paging the next part is asked for once the end of the list comes near, so the
 * list loads more as the keeper scrolls; without an IntersectionObserver every part is asked for at once. At its end a quiet
 * loader row shows while a part is on its way, a retry row when it failed (P-10), and "Das waren alle n" once every entry
 * is there, the count is known (the total of a server list, the entries of a list without `paging`) and the list is longer
 * than its box (`ListEnd`). A list without `paging` is measured only in a box that is a marked scroll region, and adds the
 * marker row only when it is longer, so a list that fits has no row of its own and a page that scrolls does not grow by one.
 * The address holds no position: an old `?from=n` is stripped once (`useStripOldPositions`).
 * A list inside a marked scroll region (a page's region, a layer's body) asks from the edge of that region, not of the window.
 * A list that fills its frame (`fit`) takes the room the frame leaves and scrolls in its own box, so it is a tab stop for the keyboard (WCAG 2.1.1, axe scrollable-region-focusable).
 * In a sheet, a dialog or a pane (`useInLayer()`) `fit` has no effect: the list is the content of the layer, which scrolls under the title and the actions of the layer (owner decision 2026-11-23, issue 2418).
 * It never gets shorter than one row and a bit (`min-h-24`, in rem, so it follows the text size): where the frame has no
 * room left (200 % text), the frame scrolls instead and the list does not collapse to nothing. Its rows never shrink
 * below their content: a group clips its rows (`overflow-hidden`), which would let a flex column squeeze them to nothing.
 */
export function ScrollEntries<T>({
  items,
  pageSize,
  renderItem,
  getKey,
  label,
  listClassName,
  resetKey,
  fit: wantsFit = false,
  paging,
  end,
}: ScrollEntriesProps<T>) {
  // A list in a layer is the content of the layer, which scrolls under its title and its action: it takes no box of its own.
  const inLayer = useInLayer();
  const fit = wantsFit && !inLayer;
  const paged = paging !== undefined;
  const loaded = items.length;
  const count = knownCount(paging, loaded);
  const list = React.useRef<HTMLUListElement>(null);
  useStripOldPositions();
  const wanted = useWanted(list, { paged, loaded, count, pageSize, fit, resetKey });
  const missing = usePagingMore(paging, loaded, wanted, count);
  const note = useRetryFocus(paging, missing, list);
  const longer = useScrollOverflow(list, fit, loaded, paged);
  // The count is known for a list without `paging` (every entry is loaded) and for a server list with its total (P-08). The
  // marker needs every entry, and a list that is longer than its box: a list that fits renders no row of its own.
  const known = paging === undefined || paging.total !== undefined;
  const marker = endCount({ end, known, longer, loaded, count });

  const holes = placeholderCount(paging, missing, Math.min(wanted, count) - loaded);

  return (
    <div className={cn("flex flex-col gap-3", fit && "min-h-24 flex-1")}>
      <ul
        ref={list}
        {...(fit ? { "data-page-fit": "", "data-scroll-region": "", tabIndex: 0 } : {})}
        aria-label={label}
        {...busyWhile(holes)}
        className={cn(
          "flex flex-col gap-2",
          fit && "min-h-24 flex-1 content-start overflow-y-auto overscroll-contain [&>li]:shrink-0",
          listClassName,
        )}
      >
        {items.map((item, i) => (
          <li key={getKey ? getKey(item, i) : i} className="shrink-0">
            {renderItem(item, i)}
          </li>
        ))}
        <EntryPlaceholders count={holes} from={loaded} paging={paging} />
        {note || marker !== undefined ? (
          <ListEnd paging={note} missing={missing} marker={marker} />
        ) : null}
      </ul>
    </div>
  );
}
