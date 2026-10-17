import { describe, expect, it } from "vitest";
import { objectKey } from "./keys";

const A = "11111111-1111-4111-8111-111111111111";

describe("TE-05 / QG-D3 object keys are account-scoped", () => {
  it("builds the key from the account id and a plain name", () => {
    const key = objectKey(A.toUpperCase(), "photo-1.jpg");
    expect(key).toEqual({ ok: true, value: `${A}/photo-1.jpg` });
  });

  it.each([
    "../x.jpg",
    "a/b.jpg",
    "/x.jpg",
    "x.jpg/",
    "x.png",
    "",
    ".jpg",
    "a b.jpg",
    "x\u0000.jpg",
  ])("rejects the name %j so a key can never leave the account prefix", (name) => {
    const key = objectKey(A, name);
    expect(!key.ok && key.error.code).toBe("media.name_invalid");
  });

  it("rejects an account id that is not a UUID", () => {
    for (const id of ["", "..", `${A}/..`, "not-an-id"]) {
      const key = objectKey(id, "x.jpg");
      expect(!key.ok && key.error.code).toBe("media.name_invalid");
    }
  });
});
