/** Length in ms of the short vibration on a decision (starting value, assumption). */
export const HAPTIC_MS = 12;

/** One short vibration where the browser offers it (US-ENT-01, US-TAU-02); there is no sound. Without the API it is silent. */
export function vibrateOnDecision(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function")
    navigator.vibrate(HAPTIC_MS);
}
