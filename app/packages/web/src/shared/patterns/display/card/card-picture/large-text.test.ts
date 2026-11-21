// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { largeText } from "./large-text";

afterEach(() => vi.restoreAllMocks());

/** Sets the root font size the way the keeper's text setting does, then asks (US-QS-21). */
const rootSize = (px: string) =>
  vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: px } as CSSStyleDeclaration);

describe("US-QS-32 · SG-TYPE-04 largeText reads the text size the keeper set", () => {
  it("US-QS-32 · SG-TYPE-04 a root text size of 150 % (24 px) and more counts as large", () => {
    rootSize("24px");
    expect(largeText()).toBe(true);
    rootSize("32px");
    expect(largeText()).toBe(true);
  });

  it("US-QS-32 · SG-TYPE-04 the normal size (16 px) and 125 % (20 px) do not count as large", () => {
    rootSize("16px");
    expect(largeText()).toBe(false);
    rootSize("20px");
    expect(largeText()).toBe(false);
  });
});
