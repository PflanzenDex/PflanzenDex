import { describe, expect, it } from "vitest";
import { objectKey } from "./keys";

const A = "11111111-1111-4111-8111-111111111111";

describe("TE-05 / QG-D3 object keys are account-scoped", () => {
  it("builds the key from the account id and a plain name", () => {
    const key = objectKey(A.toUpperCase(), "photo-1.webp");
    expect(key).toEqual({ ok: true, value: `${A}/photo-1.webp` });
  });

  it.each([
    "../x.webp",
    "a/b.webp",
    "/x.webp",
    "x.webp/",
    "x.png",
    "x.jpg",
    "",
    ".webp",
    "a b.webp",
    "x\u0000.webp",
  ])("rejects the name %j so a key can never leave the account prefix", (name) => {
    const key = objectKey(A, name);
    expect(!key.ok && key.error.code).toBe("media.name_invalid");
  });

  it("rejects an account id that is not a UUID", () => {
    for (const id of ["", "..", `${A}/..`, "not-an-id"]) {
      const key = objectKey(id, "x.webp");
      expect(!key.ok && key.error.code).toBe("media.name_invalid");
    }
  });
});
