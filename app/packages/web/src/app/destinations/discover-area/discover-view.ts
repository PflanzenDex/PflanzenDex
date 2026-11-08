import { useSearchParams } from "react-router";
import { readStored, writeStored } from "@/shared/platform/browser/storage";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { useFeature } from "@/shared/data";

export type DiscoverView = "suggestions" | "catalog";

/** The query parameter of the mode in the address, e.g. `/discover?view=catalog` (US-QS-14). */
export const DISCOVER_VIEW_PARAM = "view";
/** Per-device convenience only: the address always wins, and a failing storage changes nothing (DS-10). */
export const DISCOVER_VIEW_KEY = "pflanzendex.discover-view";

export const DISCOVER_VIEWS: readonly { value: DiscoverView; label: string }[] = [
  { value: "suggestions", label: "Vorschläge" },
  { value: "catalog", label: "Katalog" },
];

const parse = (v: string | null | undefined): DiscoverView | null =>
  v === "suggestions" || v === "catalog" ? v : null;

/**
 * Whether the suggestions are offered. They are the function "discover" (US-ENT), and every Ja or Nein on a card writes a
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
 * The mode the address, the device and the switches give (US-QS-14), as a plain function: the route's fallback draws the
 * same shape before the area is there (issue 1697). From the address, else the one remembered on this device, else the
 * suggestions; an unknown value falls back like a missing one, and without the suggestions only the catalog is left.
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

/**
 * The mode of the destination "Entdecken" (US-QS-14), see `discoverViewOf`. Switching adds a history entry (back works),
 * remembers the choice and tells screen readers; the state `keepFocus` leaves the focus on the control (RouteFocus).
 */
export function useDiscoverView(): { view: DiscoverView; choose: (v: DiscoverView) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const suggestions = useSuggestionsOn();
  const view = discoverViewOf(
    params.toString(),
    readStored(DISCOVER_VIEW_KEY) ?? null,
    suggestions,
  );
  const choose = (next: DiscoverView) => {
    if (next === view) return;
    writeStored(DISCOVER_VIEW_KEY, next);
    setParams({ [DISCOVER_VIEW_PARAM]: next }, { state: { keepFocus: true } });
    announce?.announce(DISCOVER_VIEWS.find((o) => o.value === next)?.label ?? "");
  };
  return { view, choose };
}
