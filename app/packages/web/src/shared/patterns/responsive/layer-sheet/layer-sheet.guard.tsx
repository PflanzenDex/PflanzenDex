import * as React from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import {
  UnsavedQuestion,
  preloadUnsavedQuestion,
} from "@/shared/ui/overlays/unsaved-input-dialog/unsaved-question/unsaved-question";
import {
  FROM_APP,
  LAYER_GUARD,
  LayerGuardContext,
  focusLayer,
  isClosing,
  setClosing,
  stateFlag,
  type UnsavedGuard,
} from "./use-layer";
import {
  addressOf,
  guardHere,
  isHeld,
  reopenLayer,
  useLayerOrdering,
  type Refs,
} from "./layer-sheet.history";

type Action = (() => void) | null;

/**
 * The question's state and its buttons (US-QS-32): "Weiter bearbeiten" keeps the layer, "Verwerfen" runs the pending
 * action (the close the person asked for, or a cancel of a form).
 */
function useQuestion(refs: Refs) {
  const [asking, setAsking] = React.useState(false);
  // How often a close was refused: a sheet snaps back at each one (`SheetPanel`).
  const [refusals, setRefusals] = React.useState(0);
  const pending = React.useRef<Action>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const kept = React.useRef(false);
  const ask = React.useCallback((action: Action) => {
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement ? focused : null;
    pending.current = action;
    setAsking(true);
  }, []);
  /** A close the person asks for: asks while input is unsaved, otherwise closes at once. */
  const requestClose = () => {
    if (!refs.dirty.current) {
      refs.latest.current.closeLayer();
      return;
    }
    setRefusals((n) => n + 1);
    ask(null);
  };
  const keep = React.useCallback(() => {
    kept.current = true;
    pending.current = null;
    setAsking(false);
  }, []);
  const discard = React.useCallback(() => {
    const action = pending.current ?? (() => refs.latest.current.closeLayer());
    pending.current = null;
    refs.dirty.current = false;
    setAsking(false);
    action();
  }, [refs]);
  return { asking, setAsking, refusals, ask, pending, returnTo, kept, requestClose, keep, discard };
}

type QuestionState = ReturnType<typeof useQuestion>;

/**
 * The address drives the guard (US-QS-32): Back asks, or closes a layer without input; a walk back over the guard goes on
 * until the address drops the layer; the focus returns into the layer after "Weiter bearbeiten". A Back that passes a
 * layer with unsaved input is held and put back with its question (issue 2145).
 */
function useWalk(layer: { id: string; open: boolean; key: string }, refs: Refs, q: QuestionState) {
  const { id, open, key } = layer;
  // Only stable values in the dependencies: the walk runs on a new address, never on a plain re-render.
  const { asking, setAsking, pending, returnTo, kept, ask } = q;
  React.useEffect(() => {
    const c = refs.latest.current;
    if (isClosing(id)) {
      if (!c.open) {
        setClosing(id, false);
        refs.guarded.current = false;
        return;
      }
      if (stateFlag(c.location.state, FROM_APP)) {
        void c.navigate(-1);
        return;
      }
      setClosing(id, false);
      refs.guarded.current = false;
      c.closeLayer();
      return;
    }
    if (c.type !== "POP" || stateFlag(c.location.state, LAYER_GUARD) || !refs.guarded.current)
      return;
    refs.guarded.current = false;
    if (c.held && refs.named.current) {
      ask(null);
      reopenLayer(c, refs.guarded, refs.named.current);
      return;
    }
    if (!c.open) return;
    if (!refs.dirty.current) {
      c.closeLayer();
      return;
    }
    ask(null);
    guardHere(c, refs.guarded);
  }, [key, id, refs, ask]);
  // A layer mounted only while its address names it unmounts when the walk lands off it: the walk ends with it.
  React.useEffect(() => () => setClosing(id, false), [id]);
  React.useEffect(() => {
    if (open) return;
    refs.guarded.current = false;
    pending.current = null;
    setAsking(false);
  }, [open, refs, pending, setAsking]);
  React.useEffect(() => {
    if (asking || !kept.current) return;
    kept.current = false;
    focusLayer(returnTo.current);
  }, [asking, kept, returnTo]);
}

/**
 * The guard of a layer (US-QS-32, SG-FORM-06, SG-SHEET-05). Typed input pushes a guard entry above the layer, so Back
 * lands on it and asks. A close the person asks for (Escape, close control, swipe, outside tap) asks while input is
 * unsaved. A close the app makes after a saved write does not ask: `closeLayer` walks back over the guard. A second Back
 * before the question comes up holds the layer on screen (`held`), so its input survives (issue 2145).
 */
export function useLayerGuard(
  id: string,
  open: boolean,
  replaced: boolean,
  closeLayer: () => void,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const [refs] = React.useState<Refs>(() => ({
    dirty: { current: false },
    guarded: { current: false },
    latest: { current: { id, open, held: false, type, location, navigate, closeLayer } },
    named: { current: null },
  }));
  const held = isHeld({ id, open, replaced, type, state: location.state, refs });
  React.useLayoutEffect(() => {
    refs.latest.current = { id, open, held, type, location, navigate, closeLayer };
    if (open) refs.named.current = addressOf(location);
  });
  const fromApp = stateFlag(location.state, FROM_APP);
  const guardEntry = stateFlag(location.state, LAYER_GUARD);
  useLayerOrdering(refs, { open, fromApp, guardEntry, key: location.key });
  const q = useQuestion(refs);
  // The walk and the focus follow what is shown: a held layer is still open for them.
  useWalk({ id, open: open || held, key: location.key }, refs, q);
  const setDirty = React.useCallback(
    (value: boolean) => {
      refs.dirty.current = value;
      if (!value) return;
      preloadUnsavedQuestion();
      if (!refs.guarded.current && refs.latest.current.open)
        guardHere(refs.latest.current, refs.guarded);
    },
    [refs],
  );
  const leave = React.useCallback(
    (action: () => void) => {
      if (refs.dirty.current) q.ask(action);
      else action();
    },
    [q.ask, refs],
  );
  const value = React.useMemo<UnsavedGuard>(() => ({ setDirty, leave }), [setDirty, leave]);
  return {
    value,
    held,
    asking: q.asking,
    refusals: q.refusals,
    requestClose: q.requestClose,
    keep: q.keep,
    discard: q.discard,
  };
}

export type LayerGuard = ReturnType<typeof useLayerGuard>;

/** Provides the guard to the forms of a layer; the question sits beside the layer, not inside its pane or sheet. */
export function LayerGuarded(props: { guard: LayerGuard; children: React.ReactNode }) {
  const { guard } = props;
  return (
    <LayerGuardContext.Provider value={guard.value}>
      {props.children}
      {guard.asking ? <UnsavedQuestion onKeep={guard.keep} onDiscard={guard.discard} /> : null}
    </LayerGuardContext.Provider>
  );
}
