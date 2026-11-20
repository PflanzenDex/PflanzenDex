// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSessionStored,
  readStored,
  removeStored,
  writeSessionStored,
  writeStored,
} from "./storage";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
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

describe("US-QS-27 · the storage of the news banner", () => {
  it("US-QS-27 removes a stored value, and a missing one is removed without an error", () => {
    writeStored("k", "1");
    expect(removeStored("k")).toBe(true);
    expect(readStored("k")).toBeUndefined();
    expect(removeStored("k")).toBe(true);
  });

  it("US-QS-27 keeps a value for the browser tab's session apart from the device storage", () => {
    expect(writeSessionStored("s", "1")).toBe(true);
    expect(readSessionStored("s")).toBe("1");
    expect(readStored("s")).toBeUndefined();
  });

  it("US-QS-27 session storage that throws reads nothing and writes nothing, without an error", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readSessionStored("s")).toBeUndefined();
    expect(writeSessionStored("s", "1")).toBe(false);
  });
});
