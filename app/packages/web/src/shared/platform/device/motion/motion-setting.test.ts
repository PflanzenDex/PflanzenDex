// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MOTION_STORAGE_KEY,
  applyMotion,
  followDeviceOnly,
  motionReduced,
  restoreMotion,
  useAccountMotion,
} from "./motion-setting";
import { useReducedMotion } from "./use-reduced-motion";

const root = document.documentElement;

/** The device setting of a test: `reduce` answers the reduced-motion query, `change` fires its change event. */
function device(reduce: boolean) {
  const listeners = new Set<() => void>();
  const state = { reduce };
  window.matchMedia = ((query: string) => ({
    get matches() {
      return state.reduce && query.includes("reduce");
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return {
    change(next: boolean) {
      state.reduce = next;
      listeners.forEach((l) => l());
    },
  };
}

afterEach(() => {
  delete root.dataset.motion;
  window.localStorage.clear();
});

describe("US-QS-33 · reduced motion is the device or the account choice", () => {
  it("US-QS-33 a keeper who never chose follows the device: reduced when it asks, with motion when it does not", () => {
    device(true);
    expect(motionReduced()).toBe(true);
    device(false);
    expect(motionReduced()).toBe(false);
  });

  it("US-QS-33 'Bewegung aus' reduces motion also when the device does not ask for it, and marks the page for the CSS", () => {
    device(false);
    applyMotion("reduced");
    expect(root.dataset.motion).toBe("reduced");
    expect(motionReduced()).toBe(true);
  });

  it("US-QS-33 'Wie auf dem Gerät' never forces motion on against a device that asks for less", () => {
    device(true);
    applyMotion("system");
    expect(root.dataset.motion).toBeUndefined();
    expect(motionReduced()).toBe(true);
  });

  it("US-QS-33 the app start takes the last choice known on this device before the account is loaded", () => {
    device(false);
    applyMotion("reduced");
    delete root.dataset.motion;
    restoreMotion();
    expect(root.dataset.motion).toBe("reduced");
    window.localStorage.setItem(MOTION_STORAGE_KEY, "system");
    restoreMotion();
    expect(root.dataset.motion).toBeUndefined();
  });

  it("US-QS-33 with no choice known on this device, or an unreadable one, the device decides", () => {
    device(false);
    window.localStorage.setItem(MOTION_STORAGE_KEY, "sideways");
    restoreMotion();
    expect(root.dataset.motion).toBeUndefined();
    window.localStorage.clear();
    restoreMotion();
    expect(motionReduced()).toBe(false);
  });

  it("US-QS-33 the sign-in pages follow only the device; the copy of the choice stays for the next start", () => {
    device(false);
    applyMotion("reduced");
    followDeviceOnly();
    expect(root.dataset.motion).toBeUndefined();
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduced");
  });

  it("US-QS-33 useAccountMotion: pending keeps the copy, an account applies its choice, no account follows the device", () => {
    device(false);
    window.localStorage.setItem(MOTION_STORAGE_KEY, "reduced");
    restoreMotion();
    const { rerender } = renderHook(
      (s: Parameters<typeof useAccountMotion>[0]) => useAccountMotion(s),
      {
        initialProps: undefined,
      },
    );
    expect(root.dataset.motion).toBe("reduced");
    rerender("system");
    expect(root.dataset.motion).toBeUndefined();
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("system");
    rerender("reduced");
    expect(root.dataset.motion).toBe("reduced");
    rerender("device");
    expect(root.dataset.motion).toBeUndefined();
  });

  it("US-QS-33 a changed choice applies at once to the open screen, without a reload; so does a change on the device", () => {
    const d = device(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => applyMotion("reduced"));
    expect(result.current).toBe(true);
    act(() => applyMotion("system"));
    expect(result.current).toBe(false);
    act(() => d.change(true));
    expect(result.current).toBe(true);
  });
});
