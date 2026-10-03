import { describe, expect, it } from "vitest";
import { PRODUKT_NAME, produktTitel } from "./produkt";

describe("Produktname (Gerüst-Test, TE-01)", () => {
  it("liefert den Produktnamen", () => {
    expect(produktTitel()).toBe(PRODUKT_NAME);
  });
});
