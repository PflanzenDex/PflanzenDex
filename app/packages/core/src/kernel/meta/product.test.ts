import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, productTitle } from "./product";

describe("product name (scaffold test, TE-01)", () => {
  it("returns the product name", () => {
    expect(productTitle()).toBe(PRODUCT_NAME);
  });
});
