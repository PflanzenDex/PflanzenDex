// The view transition of a route change (US-QS-14), loaded after the shell is painted (DS-08).
/** Longest wait for a lazy view before the cross-fade starts anyway (starting value, assumption). */
const MAX_WAIT_MS = 300;
const ROOT = document.documentElement;

type Where = { pathname: string; state: unknown };

const calm = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A switch inside a view keeps its place (`keepFocus`), so it is not a view change either. */
const isViewChange = (from: Where, to: Where) =>
  from.pathname !== to.pathname && (to.state as { keepFocus?: boolean } | null)?.keepFocus !== true;

/**
 * `run` wraps `apply` (which renders the new view) in a view transition of the main content and returns true; it
 * returns false when nothing is to be animated and the caller applies the change itself. `settle` tells it that the
 * new view has been committed. The transition waits for that, but never longer than `MAX_WAIT_MS`.
 */
export function createTransitions() {
  let settle = () => {};
  return {
    settle: () => settle(),
    run(from: Where, to: Where, apply: () => void): boolean {
      if (!document.startViewTransition || !calm() || !isViewChange(from, to)) return false;
      ROOT.dataset.routeTransition = "";
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, MAX_WAIT_MS);
            settle = () => {
              clearTimeout(timer);
              resolve();
            };
            apply();
          }),
      );
      // Skipped or finished: the marker goes in either case, so the main region is a plain element again.
      const done = () => void delete ROOT.dataset.routeTransition;
      transition.finished.then(done, done);
      return true;
    },
  };
}
