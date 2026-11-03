// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnline } from "./network";

afterEach(() => vi.restoreAllMocks());

describe("US-QS-07 · DS-11 platform adapter network", () => {
  it("US-QS-07 · DS-11 reports whether the device believes it is online", () => {
    const state = vi.spyOn(window.navigator, "onLine", "get");
    state.mockReturnValue(false);
    expect(isOnline()).toBe(false);
    state.mockReturnValue(true);
    expect(isOnline()).toBe(true);
  });
});
