import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const PARAM = "sheet";
/** History state set when the app itself opened the layer, so closing can go back instead of leaving the app. */
const FROM_APP = "layerFromApp";

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
  /** Closes the layer: back when the app opened it, otherwise it only removes the address part. */
  closeLayer: () => void;
};

/** State and actions of the layer `id` from the address `?sheet=<id>` (US-QS-15). Use it to build an opener. */
export function useLayer(id: string): LayerControl {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const named = params.get(PARAM);
  const open = named === id;
  const fromApp = (location.state as Record<string, unknown> | null)?.[FROM_APP] === true;
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
 * The last value that was set, kept while the address no longer names it (US-QS-15, F12). A layer's content comes from the
 * address, which loses the layer at once when it closes; the caller keeps rendering the last value, and the layer shows it
 * only while it is open or still leaving (`LayerSheet`), so a closed layer renders nothing.
 */
export function useExitValue<T>(value: T | null | undefined): T | undefined {
  const last = React.useRef<T | undefined>(undefined);
  if (value !== null && value !== undefined) last.current = value;
  return value ?? last.current;
}
