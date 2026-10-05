// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStored, writeStored } from "./storage";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("US-QS-07 · DS-10 storage adapter", () => {
  it("US-QS-07 · DS-10 writes a value and reads it back", () => {
    expect(writeStored("k", "1")).toBe(true);
    expect(readStored("k")).toBe("1");
  });

  it("US-QS-07 · DS-10 returns undefined for a missing key, not an invented value", () => {
    expect(readStored("missing")).toBeUndefined();
  });

  it("US-QS-07 · DS-10 does not throw when storage throws (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readStored("k")).toBeUndefined();
    expect(writeStored("k", "1")).toBe(false);
  });
});
