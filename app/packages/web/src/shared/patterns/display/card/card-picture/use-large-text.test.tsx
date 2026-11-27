// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLargeText } from "./use-large-text";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

/** jsdom has no layout: the size is read through getComputedStyle, which follows the root's inline font size here. */
const followRoot = () =>
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        fontSize: document.documentElement.style.fontSize || "16px",
      }) as CSSStyleDeclaration,
  );

describe("US-QS-15 · US-QS-32 issue 2617 useLargeText follows the root text size after mount", () => {
  it("US-QS-15 · US-QS-32 a text size raised to 200 % after mount turns large on, and back off", async () => {
    followRoot();
    const { result } = renderHook(() => useLargeText());
    expect(result.current).toBe(false);
    await act(async () => {
      document.documentElement.style.fontSize = "200%";
      document.documentElement.style.fontSize = "32px";
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
    await act(async () => {
      document.documentElement.style.fontSize = "16px";
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it("US-QS-15 · US-QS-32 a window resize reads the size again", () => {
    followRoot();
    const { result } = renderHook(() => useLargeText());
    document.documentElement.style.fontSize = "32px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);
  });
});
