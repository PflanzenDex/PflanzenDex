import { describe, expect, it } from "vitest";
import type { Need } from "../needs";
import { equipmentRecommendations, type ProductEntry } from "./index";

const need = (id: string, kind: Need["kind"]): Need => ({
  id,
  kind,
  reason: `Grund ${id}`,
  source: "Quelle",
  nextAction: "Tu etwas",
});
const product = (over: Partial<ProductEntry> & { productId: string }): ProductEntry => ({
  name: over.productId,
  manufacturer: "Hersteller",
  serves: ["zone_without_lamp"],
  fit: 0.5,
  source: "https://example.org/datenblatt",
  retrievedOn: "2026-10-01",
  ...over,
});

describe("US-EQU-10 recommendations from a derived need", () => {
  it("US-EQU-10 nothing is recommended without a need", () => {
    expect(equipmentRecommendations([], [product({ productId: "p1" })])).toEqual([]);
  });

  it("US-EQU-10 a recommendation names product, reason from own data, source, date and is labeled", () => {
    const [r] = equipmentRecommendations(
      [need("zone:1", "zone_without_lamp")],
      [product({ productId: "p1" })],
    );
    expect(r).toMatchObject({
      needId: "zone:1",
      productId: "p1",
      manufacturer: "Hersteller",
      reason: "Grund zone:1",
      source: "https://example.org/datenblatt",
      retrievedOn: "2026-10-01",
      label: "Empfehlung",
    });
    expect(r?.nextAction).toContain("überall kaufen");
  });

  it("US-EQU-10 only products that serve the kind of the need are suggested", () => {
    const out = equipmentRecommendations(
      [need("supply:1", "supply_low")],
      [product({ productId: "lamp" }), product({ productId: "soil", serves: ["supply_low"] })],
    );
    expect(out.map((r) => r.productId)).toEqual(["soil"]);
  });

  it("US-EQU-10 FR-EQU-06 the order follows the fit, not anything else", () => {
    const out = equipmentRecommendations(
      [need("zone:1", "zone_without_lamp")],
      [
        product({ productId: "b", fit: 0.4 }),
        product({ productId: "a", fit: 0.9 }),
        product({ productId: "c", fit: 0.4 }),
      ],
    );
    expect(out.map((r) => r.productId)).toEqual(["a", "b", "c"]);
  });

  it("US-EQU-10 FR-EQU-09 an entry without source or retrieval date is never shown", () => {
    const out = equipmentRecommendations(
      [need("zone:1", "zone_without_lamp")],
      [
        product({ productId: "nosrc", source: " " }),
        product({ productId: "nodate", retrievedOn: "" }),
        product({ productId: "ok" }),
      ],
    );
    expect(out.map((r) => r.productId)).toEqual(["ok"]);
  });

  it("US-EQU-10 FR-EQU-09 a price appears only with source and retrieval date", () => {
    const n = [need("zone:1", "zone_without_lamp")];
    const priced = equipmentRecommendations(n, [
      product({
        productId: "p",
        price: { cents: 4990, source: "Shop-Seite", retrievedOn: "2026-10-02" },
      }),
    ]);
    expect(priced[0]?.price).toEqual({
      cents: 4990,
      source: "Shop-Seite",
      retrievedOn: "2026-10-02",
    });
    const unsourced = equipmentRecommendations(n, [
      product({ productId: "p", price: { cents: 4990, source: "", retrievedOn: "2026-10-02" } }),
    ]);
    expect(unsourced[0]?.price).toBeNull();
  });
});
