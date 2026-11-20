import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  PARAM,
  isGuarded,
  setClosing,
  walkOverGuard,
  withoutLayer,
  type Below,
} from "./use-layer.history";

/** History state set when the app itself opened the layer, so closing can go back instead of leaving the app. */
export const FROM_APP = "layerFromApp";
/**
 * History state of the entry above a layer whose typed input is unsaved (US-QS-32): Back from the layer then lands on
 * that entry and asks first, and a close turns it into the list it leaves to (`walkOverGuard`, issue 2158).
 */
export const LAYER_GUARD = "layerGuard";
/**
 * History state of a layer's own entry: the address of the entry directly below it, the one the layer was opened from (or
 * the list a reload or a link gets below it). A Back that lands on that address, and no further, holds the layer (issue 2145).
 */
export const BELOW = "layerBelow";

/** The element that opened the layer; focus returns to it when the layer closes (US-QS-15). */
let opener: HTMLElement | null = null;
/**
 * The id of an opener that the layer which opened it has replaced (an item opened from a row of the list layer): when
 * that list mounts again on Back, `keptOpener` gives the focus back to the row (US-QS-15, issue 1363).
 */
let returnTo: string | null = null;

type LayerControl = {
  open: boolean;
  /** The address names another layer: this one is replaced, not closed, so it leaves at once (US-QS-15, F7). */
  replaced: boolean;
  /**
   * Opens the layer: pushes a history entry, so Back closes it. Pass the event target to return focus to it. `extra` adds
   * search parameters to the same entry, so a layer opens on one of its tabs in one step (US-QS-32, `PLANT_LOCATION_TAB`);
   * the layer's own `sheet` always wins over `extra`.
   */
  openLayer: (from?: HTMLElement | null, extra?: Record<string, string>) => void;
  /**
   * Closes the layer: back when the app opened it, otherwise it only removes the address part. A layer that a reload or a
   * link opened gets its list below it first (`useLayerOrdering`, issue 2145), so it is back too; the replace is the
   * fallback. On the guard entry above the layer (typed input, US-QS-32) the guard becomes the list and the step back
   * reaches it (`walkOverGuard`), so no guard entry is left ahead (issue 2158).
   */
  closeLayer: () => void;
};

/** What a form tells its layer (US-QS-32): unsaved input, and a cancel that asks first. */
export type UnsavedGuard = {
  setDirty: (dirty: boolean) => void;
  leave: (action: () => void) => void;
};

/** The guard of the layer a form is in; `null` outside a layer (`layer-sheet.guard.tsx` provides it). */
export const LayerGuardContext = React.createContext<UnsavedGuard | null>(null);

const runNow = (action: () => void) => action();

/**
 * A form reports its unsaved input (US-QS-32, SG-FORM-06): the layer asks before a close or Back leaves it. `leave` runs
 * a cancel of the form after the question. Outside a layer it is a no-op.
 */
export function useUnsavedInput(dirty: boolean): { leave: (action: () => void) => void } {
  const guard = React.useContext(LayerGuardContext);
  React.useEffect(() => {
    guard?.setDirty(dirty);
  }, [guard, dirty]);
  // An unmounted form leaves nothing unsaved behind.
  React.useEffect(() => () => guard?.setDirty(false), [guard]);
  return { leave: guard ? guard.leave : runNow };
}

/** The flag `flag` of a history state is set. */
export const stateFlag = (state: unknown, flag: string): boolean =>
  (state as Record<string, unknown> | null)?.[flag] === true;

/** The address of the entry below a layer's entry, from its history state (issue 2145); `null` when the state names none. */
export const belowOf = (state: unknown): Below | null =>
  ((state as Record<string, unknown> | null)?.[BELOW] as Below | undefined) ?? null;

/** The state of the guard entry: it keeps the app flag of the layer below it (US-QS-32). */
export function guardState(fromApp: boolean) {
  return { [LAYER_GUARD]: true, keepFocus: true, [FROM_APP]: fromApp };
}

/**
 * The id of the element that opens the layer `id`. The opener of a layer has it, so the focus finds the opener again when
 * its layer closed and the layer above it held the opener (`restoreFocus`, `keptOpener`, US-QS-15, issue 1661).
 */
export const layerOpenerId = (id: string): string => `${id}-opener`;

/** State and actions of the layer `id` from the address `?sheet=<id>` (US-QS-15). Use it to build an opener. */
export function useLayer(id: string): LayerControl {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const named = params.get(PARAM);
  const open = named === id;
  const fromApp = stateFlag(location.state, FROM_APP);
  const guarded = stateFlag(location.state, LAYER_GUARD);
  return {
    open,
    replaced: named !== null && !open,
    openLayer: (from, extra) => {
      opener = from ?? (document.activeElement as HTMLElement | null);
      returnTo = null;
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(extra ?? {})) next.set(key, value);
      next.set(PARAM, id);
      // RouteFocus ignores `?sheet`, so the view behind the layer does not move the focus to its heading. The entry below
      // the layer is the address it is opened from (issue 2145).
      const below = { pathname: location.pathname, search: location.search };
      setParams(next, { state: { [FROM_APP]: true, [BELOW]: below } });
    },
    closeLayer: () => {
      // The committed guard flag lags behind a guard entry that is still pending (PF-031): a pushed guard counts too (2165).
      if (open && (guarded || isGuarded(id))) {
        setClosing(id, true);
        const { pathname, search, hash } = location;
        return walkOverGuard(navigate, { pathname, search: withoutLayer(search), hash });
      }
      if (fromApp) {
        void navigate(-1);
        return;
      }
      const next = new URLSearchParams(params);
      next.delete(PARAM);
      setParams(next, { replace: true });
    },
  };
}

/**
 * Gives the focus back to the element that opened the layer, once the layer is closed (US-QS-15). When that element is
 * already gone because the layer holding it was replaced by the layer it opened, its id is kept for `keptOpener`.
 */
export function restoreFocus(): void {
  const target = opener;
  opener = null;
  if (!target) return;
  if (target.isConnected) target.focus();
  else if (target.id) returnTo = target.id;
}

/**
 * The kept opener (see `restoreFocus`) when it sits in `layer`, which has just mounted on Back. It is kept until another
 * layer is opened from a control, so a second run of the mount effect (React's StrictMode) finds it too. `null` when
 * nothing is kept or the opener is not in this layer (US-QS-15, issue 1363).
 */
export function keptOpener(layer: HTMLElement | null): HTMLElement | null {
  const el = returnTo ? document.getElementById(returnTo) : null;
  return el && layer?.contains(el) ? el : null;
}

/**
 * The focus after "Weiter bearbeiten" (US-QS-32): the control that had it before the question when it is in a layer's
 * body, else the title of the layer (the focus was on the page behind after a Back).
 */
export function focusLayer(returnTo: HTMLElement | null): void {
  if (returnTo?.isConnected && returnTo.closest("[data-layer-body]")) {
    returnTo.focus();
    return;
  }
  const body = document.querySelector<HTMLElement>("[data-layer-body]");
  body
    ?.closest<HTMLElement>("[data-layer-pane], [role='dialog']")
    ?.querySelector<HTMLElement>("h2")
    ?.focus();
}

/**
 * The last value that was set, kept while the address no longer names it (US-QS-15, F12). A layer's content comes from the
 * address, which loses the layer at once when it closes; the caller keeps rendering the last value, and the layer shows it
 * only while it is open or still leaving (`LayerSheet`), so a closed layer renders nothing.
 */
export function useExitValue<T>(value: T | null | undefined): T | undefined {
  const last = React.useRef<T | undefined>(undefined);
  if (value !== null && value !== undefined) last.current = value;
  return value ?? last.current;
}
