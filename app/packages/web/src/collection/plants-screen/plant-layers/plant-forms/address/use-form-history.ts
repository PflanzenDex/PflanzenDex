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
  navigate: ReturnType<typeof useNavigate>;
  type: ReturnType<typeof useNavigationType>;
};
/** What the history handling remembers between renders: input unsaved, a guard above the form, a close in progress. */
export type Refs = { dirty: Ref<boolean>; guarded: Ref<boolean>; leaving: Ref<boolean> };

/** Keeps the values of the latest render for the handlers and the effects. */
export function useLatest(value: Latest): Ref<Latest> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
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
 * The guard of the history (US-QS-15): the first input pushes a guard entry above the form. Back from the form then lands
 * on that entry; with unsaved input the person is put back on the form and asked, otherwise the guard is passed. A close
 * walks back out of the form's own entries (its guard and its layers) to the list the form replaced.
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
      // The form was passed in one step (two Backs quickly): nothing is left to ask for.
      refs.guarded.current = false;
      refs.dirty.current = false;
      return;
    }
    if (!refs.guarded.current) return;
    if (!refs.dirty.current) {
      refs.guarded.current = false;
      return;
    }
    setAsking(true);
    const { pathname, hash, search } = c.location;
    void c.navigate({ pathname, search, hash }, { state: guardState(c.location.state) });
  }, [key, latest, refs, setAsking]);
}
