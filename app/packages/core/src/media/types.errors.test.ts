import { describe, expect, it } from "vitest";
import { ERROR_CODE_FORMAT, ERROR_TEXTS } from "../kernel";

describe("TE-05 media error codes (FR-QG-11)", () => {
  it("every media.<reason> code has a German text", () => {
    const codes = Object.keys(ERROR_TEXTS).filter((c) => c.startsWith("media."));
    expect(codes.sort()).toEqual([
      "media.name_invalid",
      "media.not_an_image",
      "media.not_found",
      "media.storage_unavailable",
      "media.too_large",
      "media.type_unsupported",
    ]);
    for (const c of codes) {
      expect(c).toMatch(ERROR_CODE_FORMAT);
      expect(ERROR_TEXTS[c as keyof typeof ERROR_TEXTS].length).toBeGreaterThan(20);
    }
  });
});
