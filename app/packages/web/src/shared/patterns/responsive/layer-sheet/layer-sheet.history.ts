import * as React from "react";
import type { NavigateFunction, useLocation, useNavigationType } from "react-router";
import { BELOW, FROM_APP, LAYER_GUARD, belowOf, guardState, stateFlag } from "./use-layer";
import {
  isClosing,
  setClosing,
  setGuarded,
  walkOverGuard,
  withoutLayer,
  type Below,
} from "./use-layer.history";

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

/** The last entry that named the layer: where it is, and the entry directly below it (the one a Back holds the layer on). */
export type Named = { at: Address; below: Below | null };

/**
 * What the guard of a layer remembers between renders: the typed input, the guard entry above the layer, the latest render,
 * and the last entry that named the layer (issue 2145).
 */
export type Refs = {
  dirty: { current: boolean };
  guarded: { current: boolean };
  latest: { current: Latest };
  named: { current: Named | null };
};

/** The address of a history entry without its key and state. */
export const addressOf = ({ pathname, search, hash }: Address): Address => ({
  pathname,
  search,
  hash,
});

/** Whether the landed entry is the one directly below the layer: the same path and query (issue 2145). */
export const isBelow = (landed: Below, below: Below | null): boolean =>
  below !== null && landed.pathname === below.pathname && landed.search === below.search;

/** Pushes the guard entry above the layer at `at` (US-QS-32): it keeps the app flag of the layer below it. */
export function pushGuard(navigate: NavigateFunction, at: Address, fromApp: boolean): void {
  void navigate(at, { state: guardState(fromApp) });
}

/** Pushes the guard entry above the layer that the latest render shows (US-QS-32). */
export function guardHere(c: Latest, guarded: { current: boolean }): void {
  setGuarded(c.id, guarded, true);
  pushGuard(c.navigate, addressOf(c.location), stateFlag(c.location.state, FROM_APP));
}

/**
 * Closes the layer `id` from the guard entry above it (US-QS-32, issue 2158). The guard is read from the refs: the router
 * may not show a pending guard entry yet. Over the guard the close lands on the entry below the layer, which the layer's
 * entry names (`named`), or on the list the layer is addressed from.
 */
export function closeHere(refs: Refs, id: string): void {
  const c = refs.latest.current;
  if (!refs.guarded.current) return c.closeLayer();
  setGuarded(id, refs.guarded, false);
  setClosing(id, true);
  const { pathname, search, hash } = c.location;
  const below = refs.named.current?.below ?? { pathname, search: withoutLayer(search) };
  walkOverGuard(c.navigate, { ...below, hash });
}

/**
 * Keeps the last entry that named the layer, while it is open on its own entry (not on the guard entry above it): where it
 * is, and the entry directly below it. The entry below is the address the layer was opened from, kept in the state of the
 * layer's entry; an in-layer replace without state keeps the one before (issue 2145).
 */
export function nameLayer(refs: Refs, location: Latest["location"]): void {
  if (stateFlag(location.state, LAYER_GUARD)) return;
  // Without a recorded entry below, the list the layer is addressed from is it (as a reload or a link gets).
  const below = belowOf(location.state) ??
    refs.named.current?.below ?? {
      pathname: location.pathname,
      search: withoutLayer(location.search),
    };
  refs.named.current = { at: addressOf(location), below };
}

/**
 * Whether this render holds a layer that the address no longer names (issue 2145): a Back landed on the entry directly
 * below the layer while the guard was armed and the input unsaved. That Back is the second of two quick Backs, which passed
 * the layer before its question came up. The layer stays on screen in this very render, so its body and its input survive;
 * the walk puts it back on its entry (`reopenLayer`). A Back that jumps further, or to another address, is not held: the
 * layer closes as before and is not pulled forward. A walk that closes the layer ends the hold.
 */
export function isHeld(p: {
  id: string;
  open: boolean;
  type: Latest["type"];
  state: unknown;
  landed: Below;
  refs: Refs;
}): boolean {
  const { refs } = p;
  return (
    p.type === "POP" &&
    !p.open &&
    !stateFlag(p.state, LAYER_GUARD) &&
    !isClosing(p.id) &&
    refs.guarded.current &&
    refs.dirty.current &&
    isBelow(p.landed, refs.named.current?.below ?? null)
  );
}

/** Puts a held layer back on the entry it had, above the entry below it, with the guard above it (issue 2145). */
export function reopenLayer(c: Latest, guarded: { current: boolean }, named: Named): void {
  void c.navigate(named.at, { state: { [FROM_APP]: true, [BELOW]: named.below } });
  setGuarded(c.id, guarded, true);
  pushGuard(c.navigate, named.at, true);
}

/**
 * A layer that opens on an entry the app did not push (a reload, a copied link, a sign-in replay) gets the list below it:
 * that entry becomes the list and the layer is pushed on it with the app flag, once. Every close is then one step back, as
 * for a layer the app opened (US-QS-15, spec 14: "the address names the layer, so Back closes it"). Only the opening
 * counts: a replace inside an open layer that drops the state (a filter) adds no entry (issue 2145).
 */
export function useLayerOrdering(
  refs: Refs,
  layer: { open: boolean; fromApp: boolean; guardEntry: boolean; key: string },
): void {
  const ordering = React.useRef(false);
  const wasOpen = React.useRef(false);
  const { open, fromApp, guardEntry, key } = layer;
  React.useLayoutEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open || fromApp || guardEntry) {
      ordering.current = false;
      return;
    }
    if (!opening || ordering.current) return;
    ordering.current = true;
    const c = refs.latest.current;
    const { pathname, search, hash } = c.location;
    const list = withoutLayer(search);
    void c.navigate({ pathname, search: list, hash }, { replace: true });
    void c.navigate(
      { pathname, search, hash },
      { state: { [FROM_APP]: true, [BELOW]: { pathname, search: list } } },
    );
  }, [key, open, fromApp, guardEntry, refs]);
}

/** The layers that hold unsaved input right now, by id (set by their guard; a parent reads it, issue 2145). */
const unsaved = new Set<string>();

/** Records whether the layer `id` holds unsaved input; its guard calls it (US-QS-32, issue 2145). */
export function setUnsaved(id: string, on: boolean): void {
  if (on) unsaved.add(id);
  else unsaved.delete(id);
}

/**
 * The last value while the layer `layerOf(value)` holds unsaved input (issue 2145). A parent that renders a layer's form only
 * while its address names the layer would unmount the form in the render where a second Back passes the layer, and the
 * question would ask about input that is gone. The parent keeps the last value for that hold only: a layer without unsaved
 * input unmounts as before, so nothing else about the layer changes (no read on reopen, no kept state).
 */
export function useKeptWhileUnsaved<T>(
  value: T | null | undefined,
  layerOf: (kept: T) => string,
): T | undefined {
  const last = React.useRef<T | undefined>(undefined);
  if (value !== null && value !== undefined) {
    last.current = value;
    return value;
  }
  const kept = last.current;
  return kept !== undefined && unsaved.has(layerOf(kept)) ? kept : undefined;
}
