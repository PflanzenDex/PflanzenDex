import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import {
  FORM_PARAM,
  FROM_APP,
  GUARD,
  PLANT_PARAM,
  SHEET_PARAM,
  formOf,
  guardState,
  stateFlag,
  type FormAddress,
  type FormKind,
} from "./form-address";
import { useLatest, useOrdering, usePopGuard, type Latest, type Refs } from "./use-form-history";

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
      refs.dirty.current = false;
      refs.guarded.current = false;
      setAsking(false);
      if (text !== undefined) setNotice(text);
      if (!c.current) return;
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
      void c.navigate(
        { pathname: c.location.pathname, search: `?${next}`, hash: c.location.hash },
        { replace: replaces, state: { [FROM_APP]: true } },
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
    const { pathname, hash, search } = c.location;
    void c.navigate({ pathname, search, hash }, { state: guardState(c.location.state) });
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
  }));
  const latest = useLatest({ location, current, navigate, type });
  useOrdering(latest, fromApp, location.key, current !== null);
  usePopGuard(latest, refs, setAsking, location.key);
  return {
    kind: current?.kind ?? null,
    plantId: current?.plantId ?? null,
    ...useFormInput(latest, refs, setNotice),
    ...useCloseActions(latest, refs, setAsking, setNotice),
    asking,
    notice,
  };
}
