import { useSyncExternalStore } from "react";

/**
 * Whether the device believes it has a network (DS-10: components never read `navigator` themselves). Only an explicit
 * `false` is offline: an environment without the flag (no browser) counts as online, as before the write refusal (US-QS-30).
 */
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function subscribe(notify: () => void): () => void {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** `isOnline()` as a hook: re-renders when the browser fires `online` or `offline` (US-QS-14). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
