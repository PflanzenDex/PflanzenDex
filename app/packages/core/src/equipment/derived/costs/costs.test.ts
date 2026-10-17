import { describe, expect, it } from "vitest";
import type { EquipmentRow, EquipmentType } from "../../store/types";
import { equipmentCosts } from "./index";

// US-EQU-09: sum per type and in total only over records with a price; the gap is stated, nothing is estimated (P-08).
let n = 0;
const item = (type: EquipmentType, priceEur: number | null): EquipmentRow =>
  ({ id: `e${++n}`, type, name: `Teil ${n}`, priceEur }) as EquipmentRow;

describe("US-EQU-09 cost view", () => {
  it("US-EQU-09 sums per type and in total over the priced records only", () => {
    const view = equipmentCosts([
      item("Lamp", 49.9),
      item("Lamp", 100),
      item("Lamp", null),
      item("Timer", 12.5),
      item("Pot", null),
    ]);
    expect(view.total).toMatchObject({ count: 5, priced: 3, sumEur: 162.4 });
    expect(view.byType).toEqual([
      { type: "Lamp", count: 3, priced: 2, sumEur: 149.9 },
      { type: "Timer", count: 1, priced: 1, sumEur: 12.5 },
      { type: "Pot", count: 1, priced: 0, sumEur: null },
    ]);
  });

  it("US-EQU-09 states for how many records the price is missing", () => {
    const items = [
      ...Array.from({ length: 7 }, () => item("Lamp", 10)),
      ...Array.from({ length: 4 }, () => item("Pump", null)),
    ];
    const view = equipmentCosts(items);
    expect(view.coverage).toBe("Summe über 7 von 11 Teilen Equipment");
    expect(view.nextAction).toContain("Bei 4 Teilen fehlt der Preis");
  });

  it("US-EQU-09 no price known means unknown, never 0 (P-08)", () => {
    const view = equipmentCosts([item("Lamp", null)]);
    expect(view.total.sumEur).toBeNull();
    expect(view.byType[0]?.sumEur).toBeNull();
  });

  it("US-EQU-09 a price of 0 is a price: the record counts as priced", () => {
    const view = equipmentCosts([item("Other", 0), item("Other", null)]);
    expect(view.total).toMatchObject({ priced: 1, sumEur: 0 });
  });

  it("US-EQU-09 all priced: no gap to fix; nothing recorded: says so", () => {
    expect(equipmentCosts([item("Lamp", 5)]).nextAction).toBeNull();
    const empty = equipmentCosts([]);
    expect(empty.coverage).toBe("Noch kein Equipment erfasst.");
    expect(empty.total).toMatchObject({ count: 0, sumEur: null });
    expect(empty.nextAction).toBeNull();
  });

  it("US-EQU-09 adds cents without drift and gives no estimate of electricity or replacement costs", () => {
    const view = equipmentCosts([item("Lamp", 0.1), item("Lamp", 0.2)]);
    expect(view.total.sumEur).toBe(0.3);
    expect(view.note).toContain("Stromkosten und Ersatzkosten");
  });
});
