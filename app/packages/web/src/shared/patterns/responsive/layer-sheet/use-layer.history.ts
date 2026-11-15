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
 * Closes from the guard entry above a layer or a form (issue 2158): the guard becomes a plain entry at `to`, as a forward
 * entry cannot be deleted; the step back reaches `to` over the layer's entry, in one handler.
 */
export function walkOverGuard(navigate: NavigateFunction, to: Below & { hash: string }): void {
  void navigate(to, { replace: true });
  void navigate(-2);
}

/** The search without the layer, as the list shows it (a layer opened by a reload gets its list below it, US-QS-15). */
export function withoutLayer(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PARAM);
  const text = params.toString();
  return text ? `?${text}` : "";
}
