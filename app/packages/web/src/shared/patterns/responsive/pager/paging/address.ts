/**
 * The address parts that a paged list once held (FR-BES-23, issue 1492): a list now holds no position in the address
 * (SG-NAV-02), so these names serve only to find and strip an old address. No React here, so it is tested as a function.
 */

/**
 * The address part of a list without a name of its own (FR-BES-23): the first entry on screen, counted from 0 (`?from=48`).
 * A page size differs per screen, so only an entry means the same plants everywhere (issue 1492).
 */
export const PAGE_PARAM = "from";

/** The address part of the pages of a list inside a layer, so it does not compete with the screen behind it (US-QS-22). */
export const LAYER_PARAM = "lfrom";

/**
 * Every address part a paged list may hold (FR-BES-23, US-QS-15): an old address may hold one of these, and
 * `RouteFocus` leaves them out when it tells a view change apart (issue 1550). They are stripped, never written.
 */
export const LIST_PARTS = [
  PAGE_PARAM,
  LAYER_PARAM,
  "vfrom",
  "ofrom",
  "efrom",
  "rfrom",
  "zfrom",
  "sfrom",
  "blfrom",
] as const;

/** An address part of a paged list (see `LIST_PARTS`). */
export type ListPart = (typeof LIST_PARTS)[number];

/**
 * The address part that a list held before issue 1492, by its name now: a page number (`?page=2`, counted from 1). Such an
 * address is stripped once, see `useStripOldPositions`. Two lists share `rpage` on different screens, so they share `rfrom`.
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

/** Whether the address holds the old page number of a list (see `OLD_PARTS`). */
export function hasOldPart(params: URLSearchParams, param: string): boolean {
  const old = OLD_PARTS.get(param);
  return old !== undefined && params.has(old);
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
