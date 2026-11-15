import {
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { FROM_APP, GUARD, guardState, listSearch, stateFlag, type FormKind } from "./form-address";

export type Ref<T> = MutableRefObject<T>;
/** The values of the latest render: the handlers and the effects read them after the render. */
export type Latest = {
  location: ReturnType<typeof useLocation>;
  current: { kind: FormKind; plantId: string } | null;
  /** The form stays on screen although the address no longer names it (`isHeldForm`, issue 2145). */
  held: boolean;
  navigate: ReturnType<typeof useNavigate>;
  type: ReturnType<typeof useNavigationType>;
};
/** The last form the address named: where it was, and which form it was (a Back that passes it puts it back, issue 2145). */
export type Named = {
  at: { pathname: string; search: string; hash: string };
  kind: FormKind;
  plantId: string;
};
/** What the history handling remembers between renders: input unsaved, a guard above the form, a close in progress. */
export type Refs = {
  dirty: Ref<boolean>;
  guarded: Ref<boolean>;
  leaving: Ref<boolean>;
  named: Ref<Named | null>;
};

/** Keeps the values of the latest render for the handlers and the effects. */
export function useLatest(value: Latest): Ref<Latest> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Keeps the last form the address named, so a Back that passes it can put it back (issue 2145). */
export function useKeepNamed(refs: Refs, location: Latest["location"], current: Latest["current"]) {
  useLayoutEffect(() => {
    if (!current) return;
    const { pathname, search, hash } = location;
    refs.named.current = {
      at: { pathname, search, hash },
      kind: current.kind,
      plantId: current.plantId,
    };
  });
}

/**
 * Whether this render holds a form the address no longer names (issue 2145): a Back landed on the list while the guard
 * was armed and the input unsaved, which is the second of two quick Backs. The form stays on screen in this very render,
 * so its input survives; `usePopGuard` puts it back with its question. Same rule as `isHeld` of the layers.
 */
export function isHeldForm(p: {
  enabled: boolean;
  current: Latest["current"];
  type: Latest["type"];
  state: unknown;
  refs: Refs;
}): boolean {
  const { refs } = p;
  return (
    p.enabled &&
    p.current === null &&
    p.type === "POP" &&
    !stateFlag(p.state, GUARD) &&
    refs.guarded.current &&
    refs.dirty.current &&
    !refs.leaving.current &&
    refs.named.current !== null
  );
}

/** A form opened without the app (a reload or a link) gets a list entry below it, so Back closes it (US-QS-15). */
export function useOrdering(latest: Ref<Latest>, fromApp: boolean, key: string, hasForm: boolean) {
  const ordering = useRef(false);
  useLayoutEffect(() => {
    const c = latest.current;
    if (!hasForm || fromApp) {
      ordering.current = false;
      return;
    }
    if (ordering.current) return;
    ordering.current = true;
    const { pathname, hash, search } = c.location;
    void c.navigate({ pathname, search: listSearch(search), hash }, { replace: true });
    void c.navigate({ pathname, search, hash }, { state: { [FROM_APP]: true } });
  }, [key, fromApp, hasForm, latest]);
}

/**
 * The second of two quick Backs passed the form, which the render holds (`isHeldForm`): the form goes back on its entry
 * above the list, with its guard above that, and the question comes up (US-QS-32, issue 2145).
 */
function reopenForm(c: Latest, refs: Refs, setAsking: Dispatch<SetStateAction<boolean>>): void {
  const named = refs.named.current;
  if (!named) return;
  setAsking(true);
  void c.navigate(named.at, { state: { [FROM_APP]: true } });
  void c.navigate(named.at, { state: guardState(true) });
}

/**
 * The guard of the history (US-QS-15): the first input pushes a guard entry above the form. Back from the form then lands
 * on that entry; with unsaved input the person is put back on the form and asked, otherwise the guard is passed. A second
 * Back that passes the form with unsaved input is put back on it with the question (issue 2145). A close walks back out
 * of the form's own entries (its guard and its layers) to the list the form replaced.
 */
export function usePopGuard(
  latest: Ref<Latest>,
  refs: Refs,
  setAsking: Dispatch<SetStateAction<boolean>>,
  key: string,
) {
  useEffect(() => {
    const c = latest.current;
    if (refs.leaving.current) {
      if (c.current) void c.navigate(-1);
      else refs.leaving.current = false;
      return;
    }
    if (c.type !== "POP" || stateFlag(c.location.state, GUARD)) return;
    if (!c.current) {
      if (c.held) reopenForm(c, refs, setAsking);
      else {
        // The form was passed without unsaved input: nothing is left to ask for.
        refs.guarded.current = false;
        refs.dirty.current = false;
      }
      return;
    }
    if (!refs.guarded.current) return;
    if (!refs.dirty.current) {
      refs.guarded.current = false;
      return;
    }
    setAsking(true);
    const { pathname, hash, search } = c.location;
    void c.navigate(
      { pathname, search, hash },
      { state: guardState(stateFlag(c.location.state, FROM_APP)) },
    );
  }, [key, latest, refs, setAsking]);
}
