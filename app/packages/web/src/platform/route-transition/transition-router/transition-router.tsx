import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Router, UNSAFE_createBrowserHistory as createBrowserHistory } from "react-router";

// The transition logic loads after the shell is painted instead of with it (DS-08); until then a view change is plain.
const load = () => import("../view-transitions").then((m) => m.createTransitions());

/**
 * The browser router with a calm cross-fade of the main content on a view change (US-QS-14, progressive enhancement).
 * It behaves like `BrowserRouter` (history, transition state) and only wraps the update in a view transition where
 * the browser has one and the person has not asked for less motion. Focus and announcements stay with `RouteFocus`.
 */
export function TransitionRouter({ children }: { children: ReactNode }) {
  const history = useRef<ReturnType<typeof createBrowserHistory>>(null);
  history.current ??= createBrowserHistory({ v5Compat: true });
  const h = history.current;
  const [state, setState] = useState({ action: h.action, location: h.location });
  const shown = useRef(state.location);
  const transitions = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  useEffect(() => {
    let alive = true;
    void load().then((t) => {
      if (alive) transitions.current = t;
    });
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(
    () =>
      h.listen((next) => {
        const apply = () => startTransition(() => setState(next));
        if (!transitions.current?.run(shown.current, next.location, apply)) apply();
      }),
    [h],
  );

  useEffect(() => {
    shown.current = state.location;
    transitions.current?.settle();
  }, [state]);

  return (
    <Router location={state.location} navigationType={state.action} navigator={h}>
      {children}
    </Router>
  );
}
