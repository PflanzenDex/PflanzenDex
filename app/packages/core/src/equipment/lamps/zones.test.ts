import { describe, expect, it } from "vitest";
import { InMemoryEquipment, equipmentId } from "../store/test-helpers";
import { zoneEquipment } from "./index";

const zone = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  luxCeiling: 1000,
  ppfd: null,
  sortOrder,
});
const Z1 = "z1";
const Z2 = "z2";
const Z3 = "z3";
const zones = {
  list: async () => [zone(Z1, "Lampe 1", 1), zone(Z2, "Lampe 2", 2), zone(Z3, "Lampe 3", 3)],
};
// Zone 1 is the cutting light and not counted; zones 2 and 3 are.
const stock = (counts: Record<string, number>) => ({
  stock: async () =>
    Object.entries(counts).map(([zoneId, count]) => ({ zoneId, name: zoneId, count })),
});
const base = {
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
};
async function lampsIn(equipment: InMemoryEquipment, entries: [string, string, string][]) {
  for (const [name, lightZoneId, status] of entries) {
    const row = await equipment.create(
      "anna",
      { ...base, type: "Lamp", name, lightZoneId },
      "active",
    );
    if (typeof row !== "string" && status !== "active")
      await equipment.setStatus("anna", row.id, status as "defective");
  }
}

describe("US-EQU-02 devices per light zone", () => {
  it("US-EQU-02 lists per zone the assigned lamps with their state", async () => {
    const equipment = new InMemoryEquipment({ anna: [Z1, Z2, Z3] });
    await lampsIn(equipment, [
      ["A", Z2, "active"],
      ["B", Z2, "defective"],
    ]);
    const view = await zoneEquipment(
      { equipment, zones, stock: stock({ [Z2]: 1, [Z3]: 0 }) },
      "anna",
    );
    expect(view.zones.map((z) => z.name)).toEqual(["Lampe 1", "Lampe 2", "Lampe 3"]);
    expect(view.zones[1]?.lamps).toEqual([
      { id: equipmentId(1), name: "A", status: "active" },
      { id: equipmentId(2), name: "B", status: "defective" },
    ]);
  });

  it("US-EQU-02 warns when a zone with specimens has no active lamp (P-10)", async () => {
    const equipment = new InMemoryEquipment({ anna: [Z1, Z2, Z3] });
    await lampsIn(equipment, [["B", Z2, "defective"]]);
    const view = await zoneEquipment(
      { equipment, zones, stock: stock({ [Z2]: 4, [Z3]: 2 }) },
      "anna",
    );
    expect(view.zones[1]?.note).toMatchObject({ kind: "no_active_lamp" });
    expect(view.zones[1]?.note?.text).toContain("4 Pflanzen");
    expect(view.zones[1]?.note?.nextAction).not.toBe("");
    expect(view.zones[2]?.note).toMatchObject({ kind: "no_active_lamp" });
  });

  it("US-EQU-02 hints, no error, at an active lamp over an empty zone", async () => {
    const equipment = new InMemoryEquipment({ anna: [Z1, Z2, Z3] });
    await lampsIn(equipment, [["A", Z3, "active"]]);
    const view = await zoneEquipment(
      { equipment, zones, stock: stock({ [Z2]: 0, [Z3]: 0 }) },
      "anna",
    );
    expect(view.zones[2]?.note).toMatchObject({ kind: "unused_capacity" });
    expect(view.zones[1]?.note).toBeNull();
  });

  it("US-EQU-02 says nothing about a zone the app does not count (unknown, P-08) or one that is fine", async () => {
    const equipment = new InMemoryEquipment({ anna: [Z1, Z2, Z3] });
    await lampsIn(equipment, [
      ["A", Z2, "active"],
      ["C", Z1, "active"],
    ]);
    const view = await zoneEquipment(
      { equipment, zones, stock: stock({ [Z2]: 3, [Z3]: 0 }) },
      "anna",
    );
    expect(view.zones[0]).toMatchObject({ specimens: null, note: null });
    expect(view.zones[1]?.note).toBeNull();
  });

  it("US-EQU-02 keeps a lamp without a zone apart and counts nothing for other types", async () => {
    const equipment = new InMemoryEquipment({ anna: [Z1, Z2, Z3] });
    await equipment.create(
      "anna",
      { ...base, type: "Lamp", name: "Alt", lightZoneId: null },
      "active",
    );
    await equipment.create(
      "anna",
      { ...base, type: "Timer", name: "T", lightZoneId: null },
      "active",
    );
    const view = await zoneEquipment({ equipment, zones, stock: stock({ [Z2]: 1 }) }, "anna");
    expect(view.unassigned).toEqual([{ id: equipmentId(1), name: "Alt", status: "active" }]);
    expect(view.zones.every((z) => z.lamps.length === 0)).toBe(true);
  });
});
