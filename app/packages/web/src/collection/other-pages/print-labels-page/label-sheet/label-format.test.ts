// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastLabelFormat, rememberLabelFormat } from "./label-format";

const KEY = "pflanzendex.print-labels-format";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("US-QS-32 the print format remembered on this device", () => {
  it("US-QS-32 the first visit gets A4-Bogen (sheet) when nothing is stored", () => {
    expect(lastLabelFormat()).toBe("sheet");
  });

  it("US-QS-32 the format chosen last is the one read back, and the key is the one of this feature", () => {
    rememberLabelFormat("single");
    expect(window.localStorage.getItem(KEY)).toBe("single");
    expect(lastLabelFormat()).toBe("single");
    rememberLabelFormat("sheet");
    expect(lastLabelFormat()).toBe("sheet");
  });

  it("US-QS-32 a stored value that is not one of the two formats falls back to A4-Bogen", () => {
    window.localStorage.setItem(KEY, "pdf-tiny");
    expect(lastLabelFormat()).toBe("sheet");
  });

  it("US-QS-32 an unavailable storage changes nothing and breaks no page (DS-10)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => rememberLabelFormat("single")).not.toThrow();
    expect(lastLabelFormat()).toBe("sheet");
  });
});
