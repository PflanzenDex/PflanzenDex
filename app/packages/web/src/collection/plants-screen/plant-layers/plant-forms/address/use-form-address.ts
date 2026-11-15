import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { BELOW, belowOf } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { walkOverGuard } from "@/shared/patterns/responsive/layer-sheet/use-layer.history";
import {
  FORM_PARAM,
  FROM_APP,
  GUARD,
  PLANT_PARAM,
  SHEET_PARAM,
  formOf,
  listSearch,
  stateFlag,
  type FormAddress,
  type FormKind,
} from "./form-address";
import {
  isHeldForm,
  pushGuard,
  useKeepNamed,
  useLatest,
  useOrdering,
  usePopGuard,
  type Latest,
  type Refs,
} from "./use-form-history";

/**
 * Closes the form from the guard entry above it (US-QS-15, issue 2158): the guard becomes a plain entry of the list the form
 * closes to, and the step back reaches that list over the form's own entry (`walkOverGuard`). The guard is read from
 * `refs.guarded` by the caller, since the router may not show the guard entry yet.
 */
function closeOverGuard(c: Latest, refs: Refs): void {
  const { pathname, hash, search } = c.location;
  const below = refs.named.current?.below ?? { pathname, search: listSearch(search) };
  walkOverGuard(c.navigate, { ...below, hash });
}

/** The handlers that close a form, and the question "Eingabe verwerfen?" (US-QS-15). */
function useCloseActions(
  latest: { current: Latest },
  refs: Refs,
  setAsking: Dispatch<SetStateAction<boolean>>,
  setNotice: Dispatch<SetStateAction<string | null>>,
) {
  const closeNow = useCallback(
    (text?: string) => {
      const c = latest.current;
      // Read before the refs are cleared: the guard entry is on the history at once, while the latest render may not show it
      // yet (issue 2158).
      const overGuard = refs.guarded.current;
      refs.dirty.current = false;
      refs.guarded.current = false;
      setAsking(false);
      if (text !== undefined) setNotice(text);
      // A held form is on screen too (issue 2145): its close walks back from its entry, as a shown form (issue 2154).
      if (!c.current && !c.held) return;
      if (overGuard) {
        closeOverGuard(c, refs);
        return;
      }
      refs.leaving.current = true;
      void c.navigate(-1);
    },
    [latest, refs, setAsking, setNotice],
  );
  const requestLeave = useCallback(() => {
    if (refs.dirty.current) setAsking(true);
    else closeNow();
  }, [closeNow, refs, setAsking]);
  const keepEditing = useCallback(() => setAsking(false), [setAsking]);
  // Buttons call these with their event: only the notice text is taken from an argument.
  return {
    leave: (text?: string) => closeNow(text),
    requestLeave,
    keepEditing,
    discard: () => closeNow(),
  };
}

/** The handlers that open a form and note its input: the first input arms the guard, a save settles it. */
function useFormInput(
  latest: { current: Latest },
  refs: Refs,
  setNotice: Dispatch<SetStateAction<string | null>>,
) {
  const open = useCallback(
    (kind: FormKind, plantId: string) => {
      const c = latest.current;
      const next = new URLSearchParams(c.location.search);
      next.delete(SHEET_PARAM);
      next.set(FORM_PARAM, kind);
      next.set(PLANT_PARAM, plantId);
      setNotice(null);
      // A form opened from a layer replaces that layer's entry, so its close is one step back to the list.
      const replaces = new URLSearchParams(c.location.search).has(SHEET_PARAM);
      // The entry below the form is the list, or, when the form replaces a layer, the entry below that layer (issue 2145).
      const below = replaces
        ? belowOf(c.location.state)
        : { pathname: c.location.pathname, search: c.location.search };
      void c.navigate(
        { pathname: c.location.pathname, search: `?${next}`, hash: c.location.hash },
        { replace: replaces, state: { [FROM_APP]: true, [BELOW]: below } },
      );
    },
    [latest, setNotice],
  );
  const typed = useCallback(() => {
    const c = latest.current;
    if (!c.current || refs.dirty.current) return;
    refs.dirty.current = true;
    if (refs.guarded.current) return;
    refs.guarded.current = true;
    pushGuard(c, refs);
  }, [latest, refs]);
  const settle = useCallback(() => {
    if (!refs.dirty.current) return;
    refs.dirty.current = false;
    if (!refs.guarded.current) return;
    refs.guarded.current = false;
    void latest.current.navigate(-1);
  }, [latest, refs]);
  return { open, typed, settle };
}

/** The forms of a plant as full views with an address (US-QS-15, DS-59, DS-68); the history guard is `usePopGuard`. */
export function useFormAddress(enabled: boolean): FormAddress {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const current = enabled ? formOf(location.search) : null;
  const fromApp = stateFlag(location.state, FROM_APP) || stateFlag(location.state, GUARD);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refs] = useState<Refs>(() => ({
    dirty: { current: false },
    guarded: { current: false },
    leaving: { current: false },
    named: { current: null },
  }));
  // A Back that passes the form with unsaved input holds it on screen until its question is answered (issue 2145).
  const landed = { pathname: location.pathname, search: location.search };
  const held = isHeldForm({ enabled, current, type, state: location.state, landed, refs });
  // The form the render shows: the one the address names, or the one a held render keeps.
  const shown = current ?? (held ? refs.named.current : null);
  const latest = useLatest({ location, current, held, navigate, type });
  useKeepNamed(refs, location, current);
  useOrdering(latest, fromApp, location.key, current !== null);
  usePopGuard(latest, refs, setAsking, location.key);
  return {
    kind: shown?.kind ?? null,
    plantId: shown?.plantId ?? null,
    ...useFormInput(latest, refs, setNotice),
    ...useCloseActions(latest, refs, setAsking, setNotice),
    asking,
    notice,
  };
}
