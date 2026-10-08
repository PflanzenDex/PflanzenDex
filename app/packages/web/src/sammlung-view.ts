import { useSearchParams } from "react-router";
import { readStored, writeStored } from "@/platform/storage";
import { useAnnounce } from "@/platform/announcer/context";
import {
  GROUP_PARAM,
  MANAGE_PARAM,
} from "./components/shared/navigation/nav-model/navigation/navigation";

export type SammlungView = "plants" | "species" | "wishlist";
/** How the species mode is arranged: the Pokédex, or the comparison by difficulty (US-BES-05). */
export type SpeciesSort = "pokedex" | "difficulty";

/** The query parameter of the mode in the address, e.g. `/collection?view=species` (US-QS-14). */
export const VIEW_PARAM = "view";
/** Per-device convenience only: the address always wins, and a failing storage changes nothing (DS-10). */
export const VIEW_KEY = "pflanzendex.collection-view";

export const SAMMLUNG_VIEWS: readonly { value: SammlungView; label: string }[] = [
  { value: "plants", label: "Pflanzen" },
  { value: "species", label: "Arten" },
  { value: "wishlist", label: "Wunschliste" },
];

/** The query parameter of the arrangement of the species, e.g. `/collection?view=species&sort=difficulty` (US-QS-14). */
export const SORT_PARAM = "sort";
export const SPECIES_SORTS: readonly { value: SpeciesSort; label: string }[] = [
  { value: "pokedex", label: "Pokédex" },
  { value: "difficulty", label: "Schwierigkeit" },
];

const parse = (v: string | null | undefined): SammlungView | null =>
  v === "plants" || v === "species" || v === "wishlist" ? v : null;

/**
 * The mode of the destination "Sammlung" (US-QS-14): from the address, else the one remembered on this device, else
 * the plants. Switching adds a history entry (back works), remembers the choice and tells screen readers; the state
 * `keepFocus` leaves the focus on the control (RouteFocus).
 */
export function useSammlungView(): { view: SammlungView; choose: (v: SammlungView) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const view = parse(params.get(VIEW_PARAM)) ?? parse(readStored(VIEW_KEY)) ?? "plants";
  const choose = (next: SammlungView) => {
    if (next === view) return;
    writeStored(VIEW_KEY, next);
    setParams({ [VIEW_PARAM]: next }, { state: { keepFocus: true } });
    announce?.announce(SAMMLUNG_VIEWS.find((o) => o.value === next)?.label ?? "");
  };
  return { view, choose };
}

/**
 * The arrangement of the species mode (US-QS-14, US-BES-05): only the address decides, `sort=difficulty` shows the
 * comparison by difficulty, anything else the Pokédex. Choosing keeps the mode and the focus on the control.
 */
export function useSpeciesSort(): { sort: SpeciesSort; choose: (s: SpeciesSort) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const sort: SpeciesSort = params.get(SORT_PARAM) === "difficulty" ? "difficulty" : "pokedex";
  const choose = (next: SpeciesSort) => {
    if (next === sort) return;
    const query: Record<string, string> = { [VIEW_PARAM]: "species" };
    if (next !== "pokedex") query[SORT_PARAM] = next;
    setParams(query, { state: { keepFocus: true } });
    announce?.announce(SPECIES_SORTS.find((o) => o.value === next)?.label ?? "");
  };
  return { sort, choose };
}

/** How the plants are arranged: all, grouped by care phase (US-PHA-01) or by location and zone (US-LIC). */
export type PlantGroup = "all" | "phase" | "location";
export const PLANT_GROUPS: readonly { value: PlantGroup; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "phase", label: "Nach Pflegephase" },
  { value: "location", label: "Nach Standort" },
];

/**
 * The grouping of the plants (US-QS-14): only the address decides, `group=phase` or `group=location`, anything else
 * shows all plants. Choosing keeps the mode and the focus on the control.
 */
export function usePlantGroup(): { group: PlantGroup; choose: (g: PlantGroup) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const raw = params.get(GROUP_PARAM);
  const group: PlantGroup = raw === "phase" || raw === "location" ? raw : "all";
  const choose = (next: PlantGroup) => {
    if (next === group) return;
    const query: Record<string, string> = { [VIEW_PARAM]: "plants" };
    if (next !== "all") query[GROUP_PARAM] = next;
    setParams(query, { state: { keepFocus: true } });
    announce?.announce(PLANT_GROUPS.find((o) => o.value === next)?.label ?? "");
  };
  return { group, choose };
}

/**
 * The management of the locations and light zones (US-LIC, US-QS-14): an in-page view of the plants, open while the
 * address carries `manage=locations`. Opening and closing are navigations without `keepFocus`, so the focus moves to
 * the heading of the view that appears; the grouping stays in the address, so closing returns to where the user was.
 */
export function useManage(): { open: boolean; setOpen: (open: boolean) => void } {
  const [params, setParams] = useSearchParams();
  const open = params.get(MANAGE_PARAM) === "locations";
  const setOpen = (next: boolean) => {
    const query = new URLSearchParams(params);
    query.set(VIEW_PARAM, "plants");
    if (next) query.set(MANAGE_PARAM, "locations");
    else query.delete(MANAGE_PARAM);
    setParams(query);
  };
  return { open, setOpen };
}
