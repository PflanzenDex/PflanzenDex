// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useObjectPhoto } from "./use-object-photo";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Counts the observers the row would create: one per row that is near the viewport and may load a picture. */
function countObservers() {
  const created = vi.fn();
  class Observer {
    constructor() {
      created();
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  return created;
}

describe("US-QS-32 an object row's photo watches the row only when a photo can load (NFR-12)", () => {
  it("US-QS-32 without a photo access no IntersectionObserver is created, even when the row is mounted", () => {
    const created = countObservers();
    const { result } = renderHook(() => useObjectPhoto(undefined, "/specimens/s1/photo"));
    act(() => result.current[0](document.createElement("div")));
    expect(created).not.toHaveBeenCalled();
    expect(result.current[1]).toBeUndefined();
  });

  it("US-QS-32 with a photo access the row is watched once, before its picture is asked", () => {
    const created = countObservers();
    const access = { api: "http://api", token: async () => "tok" };
    const { result } = renderHook(() => useObjectPhoto(access, "/specimens/s1/photo"));
    act(() => result.current[0](document.createElement("div")));
    expect(created).toHaveBeenCalledTimes(1);
  });
});
