import { describe, expect, it } from "vitest";
import { seitenTitel } from "./titel";

describe("Seitentitel (Gerüst-Test, TE-01)", () => {
  it("nutzt den Produktnamen aus core", () => {
    expect(seitenTitel()).toBe("PflanzenDex");
  });
});
