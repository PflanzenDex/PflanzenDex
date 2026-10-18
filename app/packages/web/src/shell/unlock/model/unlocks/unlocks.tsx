import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { WRITE_SUCCEEDED, useInvalidate, useRequest } from "../../../../kernel";
import { loadUnlocks, type UnlockEntry } from "../unlock-api";

type Token = () => Promise<string | undefined>;

export const UNLOCKS_KEY = ["onboarding", "unlocks"];

export type Unlocks = {
  status: "pending" | "ready" | "error";
  entries: readonly UnlockEntry[];
  errorCode?: string;
  retry: () => void;
};

const NONE: Unlocks = { status: "ready", entries: [], retry: () => undefined };
const UnlocksContext = createContext<Unlocks>(NONE);

/**
 * The lock states of the signed-in account (US-ONB-05), loaded once and refreshed after every write (plants are the
 * input of the rules). While they are not there, or when loading fails, nothing is marked as locked: the lock is
 * information, never a permission (FR-ONB-04), so no function disappears because of it. The lock page still shows
 * the failure and its retry (P-10).
 */
export function UnlocksProvider(props: { api: string; token: Token; children: ReactNode }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadUnlocks(api, t), [api]);
  const r = useRequest({ queryKey: UNLOCKS_KEY, token, load });
  const refresh = useInvalidate(UNLOCKS_KEY);
  useEffect(() => {
    window.addEventListener(WRITE_SUCCEEDED, refresh);
    return () => window.removeEventListener(WRITE_SUCCEEDED, refresh);
  }, [refresh]);
  const value = useMemo<Unlocks>(
    () => ({
      status: r.status === "error" ? "error" : r.value === undefined ? "pending" : "ready",
      entries: r.value ?? [],
      ...(r.error ? { errorCode: r.error.code } : {}),
      retry: r.retry,
    }),
    [r.status, r.value, r.error, r.retry],
  );
  return <UnlocksContext.Provider value={value}>{props.children}</UnlocksContext.Provider>;
}

export const useUnlocks = (): Unlocks => useContext(UnlocksContext);
