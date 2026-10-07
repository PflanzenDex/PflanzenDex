import { useSearchParams } from "react-router";
import { readStored, writeStored } from "@/platform/storage";
import { useAnnounce } from "@/platform/announcer/context";

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
 * The mode of the destination "Entdecken" (US-QS-14): from the address, else the one remembered on this device, else
 * the suggestions; an unknown value falls back like a missing one. Switching adds a history entry (back works),
 * remembers the choice and tells screen readers; the state `keepFocus` leaves the focus on the control (RouteFocus).
 */
export function useDiscoverView(): { view: DiscoverView; choose: (v: DiscoverView) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const view =
    parse(params.get(DISCOVER_VIEW_PARAM)) ?? parse(readStored(DISCOVER_VIEW_KEY)) ?? "suggestions";
  const choose = (next: DiscoverView) => {
    if (next === view) return;
    writeStored(DISCOVER_VIEW_KEY, next);
    setParams({ [DISCOVER_VIEW_PARAM]: next }, { state: { keepFocus: true } });
    announce?.announce(DISCOVER_VIEWS.find((o) => o.value === next)?.label ?? "");
  };
  return { view, choose };
}
