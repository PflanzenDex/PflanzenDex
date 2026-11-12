import { useLayoutEffect } from "react";
import type { MotionSetting } from "@pflanzendex/core";

/**
 * Reduced motion (US-QS-33, glossary): the device asks for it (`prefers-reduced-motion: reduce`) or the keeper chose
 * "Bewegung aus" (`reduced`). The choice marks the page with `data-motion="reduced"`, which `tokens.css` treats like the
 * device setting; the code asks `motionReduced()`. "Wie auf dem Gerät" (`system`) never forces motion on.
 */
const QUERY = "(prefers-reduced-motion: reduce)";
const REDUCED: MotionSetting = "reduced";
/** The copy of the last account choice on this device: only for the first frame, the account value wins once loaded. */
export const MOTION_STORAGE_KEY = "pflanzendex.motion";

const listeners = new Set<() => void>();
const root = () => document.documentElement;
const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

function mark(reduced: boolean): void {
  if (reduced === (root().dataset.motion === REDUCED)) return;
  if (reduced) root().dataset.motion = REDUCED;
  else delete root().dataset.motion;
  listeners.forEach((l) => l());
}

function stored(): string | null {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY);
  } catch {
    return null; // blocked storage: the device decides
  }
}

/** True while motion is reduced: by the device or by the keeper's choice. */
export function motionReduced(): boolean {
  return root().dataset.motion === REDUCED || query()?.matches === true;
}

/** Takes the account choice at once (no reload) and keeps a copy for the next start on this device. */
export function applyMotion(setting: MotionSetting): void {
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, setting);
  } catch {
    // no copy on this device: the next start follows the device until the account is loaded
  }
  mark(setting === REDUCED);
}

/** The app start, before the account is loaded: the last choice known on this device; with none, the device. */
export function restoreMotion(): void {
  mark(stored() === REDUCED);
}

/** Before an account is known (the sign-in pages): only the device setting; the copy stays for the next start. */
export function followDeviceOnly(): void {
  mark(false);
}

/** Calls `onChange` when the device setting or the choice changes; returns the unsubscribe. */
export function subscribeMotion(onChange: () => void): () => void {
  const q = query();
  listeners.add(onChange);
  q?.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    q?.removeEventListener("change", onChange);
  };
}

/**
 * The frame's part (US-QS-33): `undefined` while the account loads (the copy stays), `"device"` without an account,
 * else the account choice. A layout effect, so the choice is set before the signed-in frame is painted.
 */
export function useAccountMotion(setting: MotionSetting | "device" | undefined): void {
  useLayoutEffect(() => {
    if (setting === "device") followDeviceOnly();
    else if (setting !== undefined) applyMotion(setting);
  }, [setting]);
}
