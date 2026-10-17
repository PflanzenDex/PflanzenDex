import { describe, expect, it } from "vitest";
import { pageTitle } from "./title";

describe("page title (scaffold test, TE-01)", () => {
  it("uses the product name from core", () => {
    expect(pageTitle()).toBe("PflanzenDex");
  });
});
