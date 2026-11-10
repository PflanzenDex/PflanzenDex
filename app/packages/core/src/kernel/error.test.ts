import { describe, expect, it } from "vitest";
import { ERROR_CODE_FORMAT, ERROR_TEXTS, appError, canonical } from "./index";
import listedCodes from "./error.codes.json";

describe("FR-QG-11 error codes", () => {
  it("every code has the format <domain>.<reason> and a non-empty text", () => {
    for (const [code, text] of Object.entries(ERROR_TEXTS)) {
      expect(code).toMatch(ERROR_CODE_FORMAT);
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("appError() carries code and text", () => {
    expect(appError("access.denied")).toEqual({
      code: "access.denied",
      text: ERROR_TEXTS["access.denied"],
    });
  });

  it("FR-QG-11 every code listed in error.codes.json still exists in ERROR_TEXTS", () => {
    const missing = listedCodes.filter((code) => !Object.hasOwn(ERROR_TEXTS, code));
    expect(
      missing,
      `Error code(s) ${missing.join(", ")} are listed in error.codes.json but missing in ERROR_TEXTS. Codes are never renamed or removed (FR-QG-11): restore the old code. To change the meaning, add a new code and stop using the old one.`,
    ).toEqual([]);
  });

  it("FR-QG-11 every code in ERROR_TEXTS is listed in error.codes.json", () => {
    const unlisted = Object.keys(ERROR_TEXTS).filter((code) => !listedCodes.includes(code));
    expect(
      unlisted,
      `Error code(s) ${unlisted.join(", ")} are in ERROR_TEXTS but not in error.codes.json. Add each new code to that sorted list in the same change (FR-QG-11, error-code skill).`,
    ).toEqual([]);
  });
});

describe("canonical", () => {
  it("ignores key order and undefined", () => {
    expect(canonical({ b: 1, a: { d: [1, 2], c: undefined } })).toBe(
      canonical({ a: { d: [1, 2] }, b: 1 }),
    );
  });
  it("distinguishes different values", () => {
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: "1" }));
  });
});
