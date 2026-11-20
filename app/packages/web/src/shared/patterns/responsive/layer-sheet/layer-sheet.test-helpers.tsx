import { startTransition, useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { NavigationType, Router, UNSAFE_createMemoryHistory, type Location } from "react-router";
import { act } from "@testing-library/react";

/**
 * The router of the tests of issue 2154: a MemoryRouter whose history changes can be held back. The real routers
 * apply a history change in a transition, so a question set at normal priority can be on screen while the guard entry
 * is still pending. While `hold.on` is set, a change that pushes or replaces an entry waits in `hold.queued`; a later
 * change replaces it, as the last update of a transition decides what renders. A back step applies at once and drops
 * the held change. `releaseHold` applies the held change in a transition. A suspending child would hold the transition
 * too, but inside `act` such a render never settled in these tests, so the hold does not suspend.
 */
type Routed = { action: NavigationType; location: Location };
export const hold: { on: boolean; queued: Routed | null; apply: ((next: Routed) => void) | null } =
  {
    on: false,
    queued: null,
    apply: null,
  };
export function GatedRouter({ entry, children }: { entry: string; children: ReactNode }) {
  const [history] = useState(() =>
    UNSAFE_createMemoryHistory({ initialEntries: [entry], v5Compat: true }),
  );
  const [state, setStateImpl] = useState<Routed>({
    action: history.action,
    location: history.location,
  });
  const apply = useCallback((next: Routed) => startTransition(() => setStateImpl(next)), []);
  useLayoutEffect(() => {
    hold.apply = apply;
    // The layout effects of the children run before this one: the ordering of a form opened by its address may have
    // moved the history already. The router catches up with it, so the screen it shows is the entry the history is on.
    apply({ action: history.action, location: history.location });
    return history.listen((update) => {
      if (hold.on && update.action !== NavigationType.Pop) {
        hold.queued = update;
        return;
      }
      hold.queued = null;
      apply(update);
    });
  }, [history, apply]);
  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  );
}
/** Applies the held change in a transition, as the router would once the guard entry renders (issue 2154). */
export async function releaseHold() {
  hold.on = false;
  const queued = hold.queued;
  hold.queued = null;
  await act(async () => {
    if (queued) hold.apply?.(queued);
    await Promise.resolve();
  });
}
/** Clears the hold between tests. */
export function resetHold() {
  hold.on = false;
  hold.queued = null;
  hold.apply = null;
}
