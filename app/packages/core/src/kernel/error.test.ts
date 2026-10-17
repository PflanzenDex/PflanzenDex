import { describe, expect, it } from "vitest";
import { ERROR_CODE_FORMAT, ERROR_TEXTS, appError, canonical } from "./index";

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
