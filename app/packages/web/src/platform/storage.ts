/** Per-device key/value storage (DS-10). Web: localStorage; a native shell swaps in a Capacitor plugin. Plain strings only. */

/** The stored value, or `undefined` when missing or when storage is unavailable (private mode). */
export function readStored(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when the value was stored; false when storage is unavailable, so callers can degrade instead of crashing. */
export function writeStored(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
