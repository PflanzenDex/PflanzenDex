import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { equipmentSetSupply } from "../../supply";
import { equipmentSetStatus } from "../../status";
import { equipmentRecord } from "../../record";
import { InMemoryEquipment } from "../../store/test-helpers";
import { equipmentNeeds } from "./index";

const Z2 = "00000000-0000-4000-8000-0000000000a2";
const Z3 = "00000000-0000-4000-8000-0000000000a3";
const anna = { userId: "anna" };

function setUp(opts: { stock?: Record<string, number>; wishZones?: (string | null)[] } = {}) {
  const equipment = new InMemoryEquipment({ anna: [Z2, Z3] });
  const idem = new InMemoryIdempotencyStore();
  let n = 0;
  const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown) =>
    execute(op, { idempotency: idem }, { context: anna, input, idempotencyKey: `k${++n}` });
  const add = async (type: string, name: string, extra: Record<string, unknown> = {}) => {
    const r = await run(equipmentRecord({ equipment }), { type, name, ...extra });
    return r.ok ? r.value.id : "";
  };
  const deps = {
    equipment,
    zones: {
      list: async (u: string) =>
        u === "anna"
          ? [
              { id: Z2, name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 },
              { id: Z3, name: "Lampe 3", luxCeiling: 8000, ppfd: 150, sortOrder: 3 },
            ]
          : [],
    },
    stock: {
      stock: async (u: string) =>
        u === "anna"
          ? Object.entries(opts.stock ?? {}).map(([zoneId, count]) => ({
              zoneId,
              name: zoneId,
              count,
            }))
          : [],
    },
    wishes: {
      open: async (u: string) =>
        u === "anna" ? (opts.wishZones ?? []).map((targetZoneId) => ({ targetZoneId })) : [],
    },
  } as never;
  return { equipment, run, add, needs: (u = "anna") => equipmentNeeds(deps, u) };
}

describe("US-EQU-07 what is missing, derived from own data", () => {
  it("US-EQU-07 nothing is missing for an account with enough lamps and supply", async () => {
    const s = setUp({ stock: { [Z2]: 2 } });
    await s.add("Lamp", "Lampe A", { lightZoneId: Z2 });
    await s.add("Substrate", "Erde");
    expect(await s.needs()).toEqual([]);
  });

  it("US-EQU-07 a consumable that is low or empty is listed with reason, source and next action", async () => {
    const s = setUp();
    const soil = await s.add("Substrate", "Erde");
    const feed = await s.add("Fertilizer", "Dünger");
    await s.run(equipmentSetSupply({ equipment: s.equipment }), { id: soil, supply: "low" });
    await s.run(equipmentSetSupply({ equipment: s.equipment }), { id: feed, supply: "empty" });
    const list = await s.needs();
    expect(list.map((n) => [n.id, n.kind])).toEqual([
      [`supply:${soil}`, "supply_low"],
      [`supply:${feed}`, "supply_low"],
    ]);
    expect(list[1]?.reason).toContain("ist leer");
    for (const n of list) {
      expect(n.source.length).toBeGreaterThan(0);
      expect(n.nextAction.length).toBeGreaterThan(0);
    }
  });

  it("US-EQU-07 a zone with specimens but no active lamp is listed; without specimens it is not", async () => {
    const s = setUp({ stock: { [Z2]: 4, [Z3]: 0 } });
    const list = await s.needs();
    expect(list).toMatchObject([{ id: `zone:${Z2}`, kind: "zone_without_lamp" }]);
    expect(list[0]?.reason).toContain("4 Pflanzen");
  });

  it("US-EQU-07 a wish with a target zone without an active lamp is listed once per zone", async () => {
    const s = setUp({ wishZones: [Z3, Z3, null] });
    expect(await s.needs()).toMatchObject([
      {
        id: `wish-zone:${Z3}`,
        kind: "wish_without_lamp",
        reason: expect.stringContaining("2 Wünsche"),
      },
    ]);
    await s.add("Lamp", "Lampe 3 A", { lightZoneId: Z3 });
    expect(await s.needs()).toEqual([]);
  });

  it("US-EQU-07 a defective or retired device without replacement is listed; a working one of its type covers it", async () => {
    const s = setUp();
    const timer = await s.add("Timer", "Timer A");
    await s.run(equipmentSetStatus({ equipment: s.equipment }), { id: timer, status: "defective" });
    expect(await s.needs()).toMatchObject([{ id: `replace:${timer}`, kind: "no_replacement" }]);
    await s.add("Timer", "Timer B");
    expect(await s.needs()).toEqual([]);
  });

  it("US-EQU-07 a lamp is replaced only by an active lamp of its own zone", async () => {
    const s = setUp();
    const a = await s.add("Lamp", "Lampe A", { lightZoneId: Z2 });
    await s.run(equipmentSetStatus({ equipment: s.equipment }), { id: a, status: "retired" });
    await s.add("Lamp", "Lampe B", { lightZoneId: Z3 });
    expect((await s.needs()).map((n) => n.id)).toEqual([`replace:${a}`]);
    await s.add("Lamp", "Lampe C", { lightZoneId: Z2 });
    expect(await s.needs()).toEqual([]);
  });

  it("US-EQU-07 another account sees none of it (P-04)", async () => {
    const s = setUp({ stock: { [Z2]: 4 }, wishZones: [Z3] });
    expect(await s.needs("bert")).toEqual([]);
  });
});
