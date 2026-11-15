import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const PARAM = "sheet";
/** History state set when the app itself opened the layer, so closing can go back instead of leaving the app. */
export const FROM_APP = "layerFromApp";
/**
 * History state of the entry above a layer whose typed input is unsaved (US-QS-32): Back from the layer then lands on
 * that entry and asks first, and a close walks back over it.
 */
export const LAYER_GUARD = "layerGuard";
/** The layers that walk back over their own history entries to close (US-QS-32, see `closeLayer`). */
const closing = new Set<string>();

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
  /** Opens the layer: pushes a history entry, so Back closes it. Pass the event target to return focus to it. */
  openLayer: (from?: HTMLElement | null) => void;
  /**
   * Closes the layer: back when the app opened it, otherwise it only removes the address part. On the guard entry above
   * the layer (typed input, US-QS-32) it walks back over the guard and the layer's entry, so no guard entry is left.
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

/** Whether the layer `id` walks back over its entries to close (see `closeLayer`). */
export const isClosing = (id: string): boolean => closing.has(id);
/** Starts or ends the walk back of the layer `id`. */
export const setClosing = (id: string, on: boolean): void => {
  if (on) closing.add(id);
  else closing.delete(id);
};

/** The state of the guard entry: it keeps the app flag of the layer below it (US-QS-32). */
export function guardState(state: unknown) {
  return { [LAYER_GUARD]: true, keepFocus: true, [FROM_APP]: stateFlag(state, FROM_APP) };
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
    openLayer: (from) => {
      opener = from ?? (document.activeElement as HTMLElement | null);
      returnTo = null;
      const next = new URLSearchParams(params);
      next.set(PARAM, id);
      // RouteFocus ignores `?sheet`, so the view behind the layer does not move the focus to its heading.
      setParams(next, { state: { [FROM_APP]: true } });
    },
    closeLayer: () => {
      if (open && guarded) {
        setClosing(id, true);
        void navigate(-1);
        return;
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
