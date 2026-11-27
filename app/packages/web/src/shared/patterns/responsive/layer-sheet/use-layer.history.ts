import type { NavigateFunction } from "react-router";

/** The query parameter that names the open layer: `?sheet=<id>` (US-QS-15). */
export const PARAM = "sheet";
/** An address of a history entry, as far as the layers compare it (path and query). */
export type Below = { pathname: string; search: string };

/** The layers that are closing over their guard entry right now (US-QS-32, issue 2158, see `closeLayer`). */
const closing = new Set<string>();

/** Whether the layer `id` is closing over its guard entry (see `closeLayer`). */
export const isClosing = (id: string): boolean => closing.has(id);
/** Starts or ends the close of the layer `id` over its guard entry. */
export const setClosing = (id: string, on: boolean): void => {
  if (on) closing.add(id);
  else closing.delete(id);
};

/**
 * The layers whose guard entry is pushed (issue 2165). A guard the router does not show yet is still ahead in the history,
 * so `closeLayer` reads this set as well as the committed state. It mirrors the `guarded` ref of the layer (`setGuarded`).
 */
const guarded = new Set<string>();

/** Whether the guard entry of the layer `id` is pushed, committed or not (see `closeLayer`, issue 2165). */
export const isGuarded = (id: string): boolean => guarded.has(id);
/** Sets the guard flag `ref` of the layer `id` and the set `isGuarded` reads, which stay equal. */
export function setGuarded(id: string, ref: { current: boolean }, on: boolean): void {
  ref.current = on;
  if (on) guarded.add(id);
  else guarded.delete(id);
}

/**
 * Closes from the guard entry above a layer or a form (issue 2158): the guard becomes a plain entry at `to`, as a forward
 * entry cannot be deleted; the step back reaches `to` over the layer's entry, in one handler. `steps` is the number of entries
 * the walk goes back: the guard and the layer's own entry (2), one more for a form that also leaves the layer below it (US-QS-32).
 */
export function walkOverGuard(
  navigate: NavigateFunction,
  to: Below & { hash: string },
  steps = 2,
): void {
  void navigate(to, { replace: true });
  void navigate(-steps);
}

/**
 * The address parts that a layer owns (issue 2147): the tab of a layer, the part of a tab, the list a tab shows and the pages
 * of the lists in the tabs, with the old page numbers of the pages (`OLD_PARTS`). The list a layer closes to drops them
 * with `sheet` (`dropLayerParts`), so the next layer does not open on the tab or the page of the last one. The parts of the
 * list behind the layer stay (`from`, `view`, filters). `lfrom` is not here: screen lists use it too, such as the reminders
 * and the AI sections of the account area.
 */
export const LAYER_PARTS = [
  "tab", // the tab of the plant layer (`PLANT_TAB_PARAM`)
  "ltab", // the tab of the catalog review layer
  "teil", // the part of a tab: the care part of a plant, the part of the measure course layer
  "course", // the list of the history of a plant: measurements or leaves
  "vfrom", // the history list of a plant
  "verlauf", // its old page number
  "blfrom", // the leaves list of the history of a plant
  "ofrom", // the open treatments list of the care part of a plant
  "offen", // its old page number
  "efrom", // the done treatments list of the care part of a plant
  "erledigt", // its old page number
  "rfrom", // the rules list of the reference layer, the recommendations list of the needs layer
  "rpage", // its old page number
] as const;

/** Drops `sheet` and the layer's own parts (`LAYER_PARTS`) from the params: the list a layer closes to (issue 2147). */
export function dropLayerParts(params: URLSearchParams): void {
  for (const part of [PARAM, ...LAYER_PARTS]) params.delete(part);
}

/** The search without the layer, as the list shows it (a layer opened by a reload gets its list below it, US-QS-15). */
export function withoutLayer(search: string): string {
  const params = new URLSearchParams(search);
  dropLayerParts(params);
  const text = params.toString();
  return text ? `?${text}` : "";
}
