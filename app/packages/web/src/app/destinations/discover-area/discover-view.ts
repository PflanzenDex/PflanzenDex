import { useSearchParams } from "react-router";
import { readStored, writeStored } from "@/shared/platform/browser/storage";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { DISCOVER_VIEW_KEY } from "@/shared/patterns/navigation/nav-item";
import {
  DISCOVER_VIEW_PARAM,
  discoverViewOf,
  useSuggestionsOn,
  type DiscoverView,
} from "./discover-mode";

/** The mode and its switches, read by the area and by the route's fallback (`discover-mode.ts`, the light part). */
export { discoverViewOf, useSuggestionsOn, type DiscoverView };
/** Per-device convenience only: the address always wins, and a failing storage changes nothing (DS-10). The key lives in the navigation (SG-NAV-03). */
export { DISCOVER_VIEW_KEY };

export const DISCOVER_VIEWS: readonly { value: DiscoverView; label: string }[] = [
  { value: "suggestions", label: "Vorschläge" },
  { value: "catalog", label: "Katalog" },
];

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
