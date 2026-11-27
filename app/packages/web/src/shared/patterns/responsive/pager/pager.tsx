import * as React from "react";
import { useInLayer } from "@/shared/ui/layer-scope";
import { ScrollEntries } from "./paging/scroll-entries/scroll-entries";
import { type PagerPart } from "./paging/address";
import { type PagerPaging } from "./paging/paging";

export type { PagerPaging } from "./paging/paging";
export type { PagerPart } from "./paging/address";
export { LAYER_PARAM, PAGE_PARAM, dropPageParts } from "./paging/address";

export type PagerProps<T> = {
  items: readonly T[];
  /** Entries asked for past the loaded ones in one step with `paging`; the server part decides how many arrive. */
  pageSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key of an item; defaults to its index. */
  getKey?: (item: T, index: number) => React.Key;
  /** Accessible name of the list (German). */
  label: string;
  /** Classes of the list, e.g. a grid of tiles; the default is a column. */
  listClassName?: string;
  /** A changed value (filter, search) starts again at the first part: what was asked for is forgotten. */
  resetKey?: string | number;
  /**
   * The address part that an old address held for this list (`from` unless another list shares the address; a list in a
   * layer passed `LAYER_PARAM`). A list holds no position now (SG-NAV-02): the part is only stripped once. Only the parts
   * of `PAGER_PARTS` are accepted, so `RouteFocus` knows each one (issue 1550).
   */
  param?: PagerPart;
  /** No effect: a list holds no position in the address, so there is no history entry to replace. */
  replace?: boolean;
  /**
   * On a page the list fills its frame and scrolls in its own box (US-QS-19, issue 1029). In a sheet, a dialog or a pane it
   * has no effect: the list is the content of the layer, which scrolls (issue 2418).
   */
  fit?: boolean;
  /** The entries live on the server in parts (FR-BES-23): the next part is asked for when the end shows, see `PagerPaging`. */
  paging?: PagerPaging;
};

/**
 * A list of entries (US-QS-15, SG-LIST-01): one scrolling list at every width (`ScrollEntries`), with the end rows of a long
 * list. A list in a sheet, a dialog or a pane is the content of the layer, which scrolls under the title and the actions of
 * the layer (owner decision 2026-11-23, issue 2418): it never fills a frame of its own and carries no `data-pager` marker.
 * A list on a page carries the marker, which the gate QG-U8 counts until `Pager` is removed from the pages (issues 2419 and
 * 2422). The list holds no position in the address: an old `?from=n` is stripped once (`useStripOldPositions`).
 */
export function Pager<T>(props: PagerProps<T>) {
  const inLayer = useInLayer();
  return inLayer ? (
    <ScrollEntries {...props} fit={false} />
  ) : (
    <ScrollEntries {...props} pagerMark />
  );
}
