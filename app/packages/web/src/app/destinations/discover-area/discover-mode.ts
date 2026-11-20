import { useFeature } from "@/shared/data";

// The mode of "Entdecken" as a plain module: the start frame reads it before the shell loads. It holds no router hook, so the
// start imports only this file: with `discover-view.ts` (which has the switching hook) the start chunk grew by about 2.6 kB
// of initial JS when measured (issue 2243). `discover-view.ts` adds the hook that switches the mode.

export type DiscoverView = "suggestions" | "catalog";

/** The query parameter of the mode in the address, e.g. `/discover?view=catalog` (US-QS-14). */
export const DISCOVER_VIEW_PARAM = "view";

const parse = (v: string | null | undefined): DiscoverView | null =>
  v === "suggestions" || v === "catalog" ? v : null;

/**
 * Whether the suggestions are offered. They are the function "discover" (US-ENT), and every Wünschen or Kein Interesse on a card writes a
 * wish (US-ENT-04): so the keeper's switch of the wishlist (US-ONB-09) hides them as well as the switch of "discover".
 * Without them the catalog stays.
 */
export function useSuggestionsOn(): boolean {
  // Both are read before the result, so the hooks run in the same order on every render.
  const discover = useFeature("discover");
  const wishlist = useFeature("wishlist");
  return discover && wishlist;
}

/**
 * The mode the address, the device and the switches give (US-QS-14), as a plain function: the route's fallback and the
 * start frame draw the same shape before the area is there (issue 1697, issue 2243). From the address, else the one
 * remembered on this device, else the suggestions; an unknown value falls back like a missing one, and without the
 * suggestions only the catalog is left.
 */
export function discoverViewOf(
  search: string,
  stored: string | null,
  suggestionsOn: boolean,
): DiscoverView {
  const asked =
    parse(new URLSearchParams(search).get(DISCOVER_VIEW_PARAM)) ?? parse(stored) ?? "suggestions";
  return asked === "suggestions" && !suggestionsOn ? "catalog" : asked;
}
