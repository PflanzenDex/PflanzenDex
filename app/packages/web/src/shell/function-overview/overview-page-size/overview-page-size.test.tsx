// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { useOverviewPageSize } from "./overview-page-size";

/** jsdom has no layout: the window height is set by hand (US-QS-17). */
const setHeight = (px: number) =>
  Object.defineProperty(window, "innerHeight", { value: px, configurable: true, writable: true });

afterEach(() => setHeight(768));

describe("US-QS-17 rows per page of Was die App kann", () => {
  it("US-QS-17 · US-QS-15 on a phone the pager's size is used", () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useOverviewPageSize());
    expect(result.current).toBe(4);
  });

  it("US-QS-17 · US-QS-15 from 1024 px the rows fit the window height: seven rows at 900 px", () => {
    setViewportWidth(1440);
    setHeight(900);
    const { result } = renderHook(() => useOverviewPageSize());
    expect(result.current).toBe(7);
  });

  it("US-QS-17 keeps at least four rows on a short window", () => {
    setViewportWidth(1440);
    setHeight(500);
    const { result } = renderHook(() => useOverviewPageSize());
    expect(result.current).toBe(4);
  });
});
