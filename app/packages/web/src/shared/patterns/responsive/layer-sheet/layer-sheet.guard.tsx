import * as React from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { preloadUnsavedQuestion } from "@/shared/patterns/responsive/unsaved-input-dialog/unsaved-question/unsaved-question";
import { FROM_APP, LAYER_GUARD, focusLayer, stateFlag, type UnsavedGuard } from "./use-layer";
import { isClosing, setClosing, setGuarded } from "./use-layer.history";
import {
  closeHere,
  guardHere,
  isHeld,
  nameLayer,
  reopenLayer,
  setUnsaved,
  useLayerOrdering,
  type Refs,
} from "./layer-sheet.history";

type Action = (() => void) | null;

/**
 * The question's state and its buttons (US-QS-32): "Weiter bearbeiten" keeps the layer, "Eingabe verwerfen" runs the pending
 * action (the close the person asked for, or a cancel of a form).
 */
function useQuestion(refs: Refs, id: string) {
  const [asking, setAsking] = React.useState(false);
  // How often a close was refused: a sheet snaps back at each one (`SheetPanel`).
  const [refusals, setRefusals] = React.useState(0);
  const pending = React.useRef<Action>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const kept = React.useRef(false);
  // A question that is up already keeps its return target: a second Back does not move "Weiter bearbeiten" to the question.
  const asked = React.useRef(false);
  const ask = React.useCallback((action: Action) => {
    if (!asked.current) {
      const focused = document.activeElement;
      returnTo.current = focused instanceof HTMLElement ? focused : null;
    }
    asked.current = true;
    pending.current = action;
    setAsking(true);
  }, []);
  /** A close the person asks for: asks while input is unsaved, otherwise closes at once. */
  const requestClose = () => {
    if (!refs.dirty.current) {
      closeHere(refs, id);
      return;
    }
    setRefusals((n) => n + 1);
    ask(null);
  };
  const keep = React.useCallback(() => {
    kept.current = true;
    asked.current = false;
    pending.current = null;
    setAsking(false);
  }, []);
  const discard = React.useCallback(() => {
    const action = pending.current ?? (() => closeHere(refs, id));
    pending.current = null;
    asked.current = false;
    refs.dirty.current = false;
    setUnsaved(id, false);
    setAsking(false);
    action();
  }, [refs, id]);
  return {
    asking,
    setAsking,
    refusals,
    ask,
    pending,
    returnTo,
    kept,
    asked,
    requestClose,
    keep,
    discard,
  };
}

type QuestionState = ReturnType<typeof useQuestion>;

/**
 * The address drives the guard (US-QS-32): Back asks, or closes a layer without input; the focus returns into the layer
 * after "Weiter bearbeiten". A Back that passes a layer with unsaved input is held and put back with its question (issue
 * 2145). A close over the guard is one step to the list (`closeHere`, issue 2158).
 */
function useWalk(layer: { id: string; open: boolean; key: string }, refs: Refs, q: QuestionState) {
  const { id, open, key } = layer;
  // Only stable values in the dependencies: the walk runs on a new address, never on a plain re-render.
  const { asking, setAsking, pending, returnTo, kept, asked, ask } = q;
  React.useEffect(() => {
    const c = refs.latest.current;
    // A close over the guard steps back to the list in one go (`closeHere`): the walk ends when the layer is gone.
    if (isClosing(id)) {
      if (!c.open) {
        setClosing(id, false);
        setGuarded(id, refs.guarded, false);
      }
      return;
    }
    if (c.type !== "POP" || stateFlag(c.location.state, LAYER_GUARD) || !refs.guarded.current)
      return;
    setGuarded(id, refs.guarded, false);
    if (c.held) {
      // Held (issue 2145): the layer comes back with its question, but only while its input is still unsaved.
      if (refs.named.current && refs.dirty.current) {
        ask(null);
        reopenLayer(c, refs.guarded, refs.named.current);
      }
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
  React.useEffect(
    () => () => {
      setClosing(id, false);
      setGuarded(id, refs.guarded, false);
    },
    [id, refs],
  );
  React.useEffect(() => {
    if (open) return;
    setGuarded(id, refs.guarded, false);
    pending.current = null;
    asked.current = false;
    setAsking(false);
  }, [open, id, refs, pending, asked, setAsking]);
  React.useEffect(() => {
    if (asking || !kept.current) return;
    kept.current = false;
    focusLayer(returnTo.current);
  }, [asking, kept, returnTo]);
}

/**
 * The guard of a layer (US-QS-32, SG-FORM-06, SG-SHEET-05). Typed input pushes a guard entry above the layer, so Back
 * lands on it and asks. A close the person asks for (Escape, close control, swipe, outside tap) asks while input is
 * unsaved. A close the app makes after a saved write does not ask: `closeLayer` walks back over the guard (issue 2158).
 * A second Back onto the entry below the layer holds the layer on screen (`held`), so its input survives (issue 2145).
 */
export function useLayerGuard(id: string, open: boolean, closeLayer: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const [refs] = React.useState<Refs>(() => ({
    dirty: { current: false },
    guarded: { current: false },
    latest: { current: { id, open, held: false, type, location, navigate, closeLayer } },
    named: { current: null },
  }));
  const held = isHeld({ id, open, type, state: location.state, landed: location, refs });
  React.useLayoutEffect(() => {
    refs.latest.current = { id, open, held, type, location, navigate, closeLayer };
    if (open) nameLayer(refs, location);
  });
  const fromApp = stateFlag(location.state, FROM_APP);
  const guardEntry = stateFlag(location.state, LAYER_GUARD);
  useLayerOrdering(refs, { open, fromApp, guardEntry, key: location.key });
  const q = useQuestion(refs, id);
  // The walk and the focus follow what is shown: a held layer is still open for them.
  useWalk({ id, open: open || held, key: location.key }, refs, q);
  const setDirty = React.useCallback(
    (value: boolean) => {
      refs.dirty.current = value;
      setUnsaved(id, value);
      if (!value) return;
      preloadUnsavedQuestion();
      if (!refs.guarded.current && refs.latest.current.open)
        guardHere(refs.latest.current, refs.guarded);
    },
    [refs, id],
  );
  const leave = React.useCallback(
    (action: () => void) => {
      if (refs.dirty.current) q.ask(action);
      else action();
    },
    [q.ask, refs],
  );
  const value = React.useMemo<UnsavedGuard>(() => ({ setDirty, leave }), [setDirty, leave]);
  const { asking, refusals, requestClose, keep, discard } = q;
  return { value, held, asking, refusals, requestClose, keep, discard };
}

export type LayerGuard = ReturnType<typeof useLayerGuard>;
