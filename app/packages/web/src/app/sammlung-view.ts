import { useSearchParams } from "react-router";
import { readStored, writeStored } from "@/shared/platform/browser/storage";
import { useFeatures } from "@/shared/data";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { GROUP_PARAM, MANAGE_PARAM } from "../shared/patterns/navigation/navigation/navigation";

export type SammlungView = "plants" | "species" | "wishlist" | "equipment";
/** How the species mode is arranged: the Pokédex, or the comparison by difficulty (US-BES-05). */
export type SpeciesSort = "pokedex" | "difficulty";

/** The query parameter of the mode in the address, e.g. `/collection?view=species` (US-QS-14). */
export const VIEW_PARAM = "view";
/** Per-device convenience only: the address always wins, and a failing storage changes nothing (DS-10). */
export const VIEW_KEY = "pflanzendex.collection-view";

/**
 * The four modes of the switch. The labels are short so that the switch stands in one row on a 360 px phone at normal
 * text (issue 1100); the views keep their full names as headings ("Wunschliste", "Equipment").
 */
export const SAMMLUNG_VIEWS: readonly { value: SammlungView; label: string }[] = [
  { value: "plants", label: "Pflanzen" },
  { value: "species", label: "Arten" },
  { value: "wishlist", label: "Wünsche" },
  { value: "equipment", label: "Geräte" },
];

/** The query parameter of the arrangement of the species, e.g. `/collection?view=species&sort=difficulty` (US-QS-14). */
export const SORT_PARAM = "sort";
export const SPECIES_SORTS: readonly { value: SpeciesSort; label: string }[] = [
  { value: "pokedex", label: "Pokédex" },
  { value: "difficulty", label: "Schwierigkeit" },
];

const parse = (v: string | null | undefined): SammlungView | null =>
  v === "plants" || v === "species" || v === "wishlist" || v === "equipment" ? v : null;

/**
 * Whether a mode is offered: Wunschliste and Geräte follow the keeper's switches of the wishlist and the equipment (US-ONB-09);
 * the plants and the species always are.
 */
export function useOfferedView(): (v: SammlungView) => boolean {
  const features = useFeatures();
  const offered: Partial<Record<SammlungView, boolean>> = {
    wishlist: features?.wishlist !== false,
    equipment: features?.equipment !== false,
  };
  return (v) => offered[v] ?? true;
}

/**
 * The mode the address, the device and the switches give (US-QS-14), as a plain function: the route's fallback draws the
 * same shape before the area is there (issue 1727, as "Entdecken" in issue 1697). From the address, else the one
 * remembered on this device, else the plants; a mode that is not offered (US-ONB-09) falls back to the plants.
 */
export function sammlungViewOf(
  search: string,
  stored: string | null,
  offered: (v: SammlungView) => boolean,
): SammlungView {
  const asked = parse(new URLSearchParams(search).get(VIEW_PARAM)) ?? parse(stored) ?? "plants";
  return offered(asked) ? asked : "plants";
}

/** The arrangement of the species from the address: `sort=difficulty` or the Pokédex (US-BES-05). */
const speciesSortOf = (params: URLSearchParams): SpeciesSort =>
  params.get(SORT_PARAM) === "difficulty" ? "difficulty" : "pokedex";

/** The grouping of the plants from the address: `group=phase` or `group=location`, anything else shows all (US-QS-14). */
const plantGroupOf = (params: URLSearchParams): PlantGroup => {
  const raw = params.get(GROUP_PARAM);
  return raw === "phase" || raw === "location" ? raw : "all";
};

/** What "Sammlung" shows for an address (US-QS-14, issue 1727): the mode, the arrangement, the grouping and the open locations. */
export type SammlungShape = {
  view: SammlungView;
  sort: SpeciesSort;
  group: PlantGroup;
  /** The locations and light zones are open over the plants (`manage=locations`, US-LIC). */
  managing: boolean;
};

/** The shape of "Sammlung" the address, the device and the switches give, as a plain function (see `sammlungViewOf`). */
export function sammlungShapeOf(
  search: string,
  stored: string | null,
  offered: (v: SammlungView) => boolean,
): SammlungShape {
  const params = new URLSearchParams(search);
  const view = sammlungViewOf(search, stored, offered);
  return {
    view,
    sort: speciesSortOf(params),
    group: plantGroupOf(params),
    managing: view === "plants" && params.get(MANAGE_PARAM) === "locations",
  };
}

/**
 * The mode of the destination "Sammlung" (US-QS-14): from the address, else the one remembered on this device, else
 * the plants. A mode that is not offered (US-ONB-09) falls back to the plants. Switching adds a history entry (back
 * works), remembers the choice and tells screen readers; the state `keepFocus` leaves the focus on the control (RouteFocus).
 */
export function useSammlungView(): { view: SammlungView; choose: (v: SammlungView) => void } {
  const [params, setParams] = useSearchParams();
  const announce = useAnnounce();
  const offered = useOfferedView();
  const view = sammlungViewOf(params.toString(), readStored(VIEW_KEY) ?? null, offered);
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
  const sort = speciesSortOf(params);
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
  const group = plantGroupOf(params);
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
    query.delete("sheet");
    if (next) query.set(MANAGE_PARAM, "locations");
    else query.delete(MANAGE_PARAM);
    setParams(query);
  };
  return { open, setOpen };
}
