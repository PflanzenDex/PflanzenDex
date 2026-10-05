import { useEffect, useState, type ReactNode } from "react";
import type { ApiError, Response } from "./api";
import { LoadError } from "./load-error";
import { SIGN_IN } from "./use-write-action";

type State<T> =
  { kind: "loading" } | { kind: "error"; error: ApiError } | { kind: "loaded"; value: T };

/**
 * Loads one thing for a page and shows what the user needs while it is not there: a status while loading, the error
 * with "Erneut laden" if it fails (P-09, P-10), the content when loaded. Without a token nothing is queried. A late
 * answer of a page that was left is dropped. Changing `refresh` loads again and keeps showing the old content until
 * the new one is there (after a write on the page).
 */
export function LoadFrame<T>(props: {
  token: () => Promise<string | undefined>;
  load: (token: string) => Promise<Response<T>>;
  loadingText: string;
  /** Skeleton that mirrors the page while it loads (DS-52); it must carry the single `role="status"` with `loadingText`. */
  loadingFallback?: ReactNode;
  refresh?: number;
  children: (value: T) => ReactNode;
}) {
  const { token, load, refresh } = props;
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<State<T>>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return current && setState({ kind: "error", error: SIGN_IN });
      const r = await load(t);
      if (current)
        setState(r.ok ? { kind: "loaded", value: r.value } : { kind: "error", error: r.error });
    })();
    return () => {
      current = false;
    };
  }, [token, load, reload, refresh]);
  if (state.kind === "loading")
    return props.loadingFallback ?? <p role="status">{props.loadingText}</p>;
  if (state.kind === "error")
    return <LoadError error={state.error} onReload={() => setReload((n) => n + 1)} />;
  return <>{props.children(state.value)}</>;
}
