/**
 * The address of a paged list (FR-BES-23, issue 1492): the first entry on screen is in the address, and the pure
 * arithmetic that turns it into the page on screen. No React here, so it is tested as a function.
 */

/**
 * The address part of a list without a name of its own (FR-BES-23): the first entry on screen, counted from 0 (`?from=48`).
 * A page size differs per screen, so only an entry means the same plants everywhere (issue 1492).
 */
export const PAGE_PARAM = "from";

/** The address part of the pages of a list inside a layer, so it does not compete with the screen behind it (US-QS-22). */
export const LAYER_PARAM = "lfrom";

/**
 * Every address part a paged list may hold (FR-BES-23, US-QS-15): `Pager` takes only these as its `param`, and
 * `RouteFocus` leaves them out when it tells a view change apart (issue 1550). A new list adds its part here once.
 */
export const PAGER_PARTS = [
  PAGE_PARAM,
  LAYER_PARAM,
  "vfrom",
  "ofrom",
  "efrom",
  "rfrom",
  "zfrom",
  "sfrom",
] as const;

/** An address part of a paged list (see `PAGER_PARTS`). */
export type PagerPart = (typeof PAGER_PARTS)[number];

/**
 * The address part that a list held before issue 1492, by its name now: a page number (`?page=2`, counted from 1). Such an
 * address is converted once, see `Pager`. Two lists share `rpage` on different screens, so they share `rfrom`.
 */
export const OLD_PARTS = new Map<string, string>([
  [PAGE_PARAM, "page"],
  ["lfrom", "lpage"],
  ["vfrom", "verlauf"],
  ["ofrom", "offen"],
  ["efrom", "erledigt"],
  ["rfrom", "rpage"],
  ["zfrom", "zpage"],
  ["sfrom", "spage"],
]);

/** The first entry in the address: a non-negative whole number, otherwise the first entry (FR-BES-23). */
export function parseFrom(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** The page number of an old address (see `OLD_PARTS`): a whole number from 1, otherwise the first page. */
export function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

type Position = { first: number; page: number; pages: number };

/**
 * Where a paged list stands (FR-BES-23, issue 1492). `first` is the entry the address names, counted from 0; an entry past
 * the end shows the first entry of the last page. `page` and `pages` count the pages from `first`, so one step of "Zurück"
 * or "Weiter" changes `page` by one at any page size. A list without entries has one page.
 */
export function position({
  from,
  size,
  count,
}: {
  from: number;
  size: number;
  count: number;
}): Position {
  const last = Math.max(0, (Math.ceil(count / size) - 1) * size);
  const first = from < count ? from : last;
  const before = Math.ceil(first / size);
  return {
    first,
    page: before + 1,
    pages: before + Math.max(1, Math.ceil((count - first) / size)),
  };
}

/** Whether the address holds the old page number of a list (see `OLD_PARTS`). */
export function hasOldPart(params: URLSearchParams, param: string): boolean {
  const old = OLD_PARTS.get(param);
  return old !== undefined && params.has(old);
}

/**
 * The entry the address names for a list (issue 1492): its own part, otherwise the old page number converted at the page
 * size given, otherwise the first entry. The new part wins when both are there.
 */
export function namedEntry(params: URLSearchParams, param: string, size: number): number {
  if (params.has(param)) return parseFrom(params.get(param));
  const old = OLD_PARTS.get(param);
  if (old !== undefined && params.has(old)) return (parsePage(params.get(old)) - 1) * size;
  return 0;
}

/** Drops the address parts of the given lists, the new and the old name of each: a changed filter or part starts them again. */
export function dropPageParts(params: URLSearchParams, ...parts: string[]): void {
  for (const part of parts) {
    params.delete(part);
    const old = OLD_PARTS.get(part);
    if (old !== undefined) params.delete(old);
  }
}

/** Whether the list is paged in the address at all: its own part, or the old page number (see `OLD_PARTS`). */
export function pagedIn(params: URLSearchParams, param: string): boolean {
  return params.has(param) || hasOldPart(params, param);
}
