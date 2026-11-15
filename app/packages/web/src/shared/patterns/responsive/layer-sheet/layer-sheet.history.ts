import * as React from "react";
import type { NavigateFunction, useLocation, useNavigationType } from "react-router";
import { FROM_APP, LAYER_GUARD, guardState, isClosing, stateFlag, withoutLayer } from "./use-layer";

/** The address of a history entry, the way a layer or a form is named: path, query and hash. */
export type Address = { pathname: string; search: string; hash: string };

/** The values of the latest render; the effects of the guard read them after the render. */
export type Latest = {
  id: string;
  open: boolean;
  /** The layer stays on screen although the address no longer names it (`isHeld`). */
  held: boolean;
  type: ReturnType<typeof useNavigationType>;
  location: ReturnType<typeof useLocation>;
  navigate: NavigateFunction;
  closeLayer: () => void;
};

/**
 * What the guard of a layer remembers between renders: the typed input, the guard entry above the layer, the latest render,
 * and the last address that named the layer (the address a Back that passes the layer puts it back on, issue 2145).
 */
export type Refs = {
  dirty: { current: boolean };
  guarded: { current: boolean };
  latest: { current: Latest };
  named: { current: Address | null };
};

/** The address of a history entry without its key and state. */
export const addressOf = ({ pathname, search, hash }: Address): Address => ({
  pathname,
  search,
  hash,
});

/** Pushes the guard entry above the layer at `at` (US-QS-32): it keeps the app flag of the layer below it. */
export function pushGuard(
  navigate: NavigateFunction,
  at: Address,
  fromApp: boolean,
  guarded: { current: boolean },
): void {
  guarded.current = true;
  void navigate(at, { state: guardState(fromApp) });
}

/** Pushes the guard entry above the layer that the latest render shows (US-QS-32). */
export function guardHere(c: Latest, guarded: { current: boolean }): void {
  pushGuard(c.navigate, addressOf(c.location), stateFlag(c.location.state, FROM_APP), guarded);
}

/**
 * Whether this render holds a layer that the address no longer names (issue 2145): a Back landed on the list while the
 * guard was armed and the input unsaved. That Back is the second of two quick Backs, which passed the layer before its
 * question came up. The layer stays on screen in this very render, so its body and its input survive; the walk puts it
 * back on its entry (`reopenLayer`). A walk that closes the layer, and a layer the address names again, end the hold.
 */
export function isHeld(p: {
  id: string;
  open: boolean;
  replaced: boolean;
  type: Latest["type"];
  state: unknown;
  refs: Refs;
}): boolean {
  const { refs } = p;
  return (
    p.type === "POP" &&
    !p.open &&
    !p.replaced &&
    !stateFlag(p.state, LAYER_GUARD) &&
    !isClosing(p.id) &&
    refs.guarded.current &&
    refs.dirty.current &&
    refs.named.current !== null
  );
}

/** Puts a held layer back on the entry it had, above the list, with the guard above it (issue 2145). */
export function reopenLayer(c: Latest, guarded: { current: boolean }, named: Address): void {
  void c.navigate(named, { state: { [FROM_APP]: true } });
  pushGuard(c.navigate, named, true, guarded);
}

/**
 * A layer that is open on an entry the app did not push (a reload, a copied link, a sign-in replay) gets the list below
 * it: that entry becomes the list and the layer is pushed on it with the app flag, once. Every close is then one step
 * back, as for a layer the app opened (US-QS-15, spec 14: "the address names the layer, so Back closes it").
 */
export function useLayerOrdering(
  refs: Refs,
  layer: { open: boolean; fromApp: boolean; guardEntry: boolean; key: string },
): void {
  const ordering = React.useRef(false);
  const { open, fromApp, guardEntry, key } = layer;
  React.useLayoutEffect(() => {
    const c = refs.latest.current;
    if (!open || fromApp || guardEntry) {
      ordering.current = false;
      return;
    }
    if (ordering.current) return;
    ordering.current = true;
    const { pathname, search, hash } = c.location;
    void c.navigate({ pathname, search: withoutLayer(search), hash }, { replace: true });
    void c.navigate({ pathname, search, hash }, { state: { [FROM_APP]: true } });
  }, [key, open, fromApp, guardEntry, refs]);
}
