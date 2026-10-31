import { useLocation, useNavigate, useSearchParams } from "react-router";

const PARAM = "sheet";
/** History state set when the app itself opened the layer, so closing can go back instead of leaving the app. */
const FROM_APP = "layerFromApp";

/** The element that opened the layer; focus returns to it when the layer closes (US-QS-15). */
let opener: HTMLElement | null = null;

type LayerControl = {
  open: boolean;
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
  const open = params.get(PARAM) === id;
  const fromApp = (location.state as Record<string, unknown> | null)?.[FROM_APP] === true;
  return {
    open,
    openLayer: (from) => {
      opener = from ?? (document.activeElement as HTMLElement | null);
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

/** Gives the focus back to the element that opened the layer, once the layer is closed (US-QS-15). */
export function restoreFocus(): void {
  const target = opener;
  opener = null;
  if (target?.isConnected) target.focus();
}
