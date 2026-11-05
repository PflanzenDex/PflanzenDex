import { describe, expect, it } from "vitest";
import { photoSize } from "./validation";

// NFR-12: the size of a read is shared by every module that reads a stored image (care photos, wish images).
describe("NFR-12 the size of a stored image read", () => {
  it("NFR-12 no size is the stored copy", () => {
    const r = photoSize([]);
    expect(r.ok && r.value).toBe("full");
  });

  it("NFR-12 exactly one thumb is the thumbnail", () => {
    const r = photoSize(["thumb"]);
    expect(r.ok && r.value).toBe("thumb");
  });

  it("NFR-12 any other size, also a repeated thumb, is input.invalid on the field size", () => {
    for (const sizes of [["huge"], ["full"], [""], ["THUMB"], ["thumb", "thumb"]]) {
      const r = photoSize(sizes);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(!r.ok && r.error.details).toEqual([{ field: "size", code: "input.invalid" }]);
    }
  });
});
