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

/** Removes a stored value (US-QS-27, the count of the old news rule after its migration). `false` when storage is unavailable. */
export function removeStored(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** The value stored for this browser tab's session, or `undefined` when missing or unavailable (US-QS-27). */
export function readSessionStored(key: string): string | undefined {
  try {
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Stores a value for this browser tab's session (it ends with the tab). `false` when storage is unavailable (US-QS-27). */
export function writeSessionStored(key: string, value: string): boolean {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
