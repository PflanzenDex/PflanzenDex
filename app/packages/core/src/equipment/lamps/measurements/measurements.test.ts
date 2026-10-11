import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { equipmentRecord } from "../../record";
import { InMemoryEquipment, InMemoryLampLog, equipmentId } from "../../store/test-helpers";
import {
  equipmentDescribeLamp,
  equipmentMeasure,
  equipmentSetDeviationLimit,
  lampLight,
} from "./index";

const Z2 = "00000000-0000-4000-8000-0000000000a2";
const anna = { userId: "anna" };
const zones = {
  list: async () => [{ id: Z2, name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 }],
};
let equipment: InMemoryEquipment;
let log: InMemoryLampLog;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });
const lamp = async () => {
  const r = await run(equipmentRecord({ equipment }), {
    type: "Lamp",
    name: "Lampe A",
    lightZoneId: Z2,
  });
  return r.ok ? r.value.id : "";
};
const measure = (id: string, extra: Record<string, unknown> = {}) =>
  run(equipmentMeasure({ measurements: log }), {
    equipmentId: id,
    measuredOn: "2026-10-01",
    lux: 12000,
    ...extra,
  });
const view = () => lampLight({ equipment, zones, measurements: log, limits: log }, "anna");

beforeEach(() => {
  equipment = new InMemoryEquipment({ anna: [Z2] });
  log = new InMemoryLampLog(equipment);
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-03 measured light intensity per lamp (FR-LIC-06)", () => {
  it("US-EQU-03 one entry with date and lux makes the lamp measured; distance and method may stay unknown", async () => {
    const id = await lamp();
    expect(await measure(id)).toMatchObject({
      ok: true,
      value: { lux: 12000, distanceCm: null, method: null },
    });
    const { lamps } = await view();
    expect(lamps[0]?.last).toMatchObject({ measuredOn: "2026-10-01", lux: 12000 });
    expect(lamps[0]?.effective).toEqual({ lux: 12000, basis: "measured" });
  });

  it("US-EQU-03 keeps distance and method when given", async () => {
    const id = await lamp();
    const r = await measure(id, { distanceCm: 30, method: " Luxmeter " });
    expect(r).toMatchObject({ ok: true, value: { distanceCm: 30, method: "Luxmeter" } });
  });

  it("US-EQU-03 without a measurement it says not measured and the zone value applies (FR-LIC-06)", async () => {
    await lamp();
    const { lamps } = await view();
    expect(lamps[0]).toMatchObject({
      last: null,
      manufacturerLux: null,
      effective: { lux: 15000, basis: "zone" },
      check: null,
    });
  });

  it("US-EQU-03 separates the manufacturer value from the measured one", async () => {
    const id = await lamp();
    await run(equipmentDescribeLamp({ equipment }), { id, powerW: 40, luxStatement: 20000 });
    await measure(id);
    const { lamps } = await view();
    expect(lamps[0]).toMatchObject({
      powerW: 40,
      manufacturerLux: 20000,
      last: { lux: 12000 },
    });
  });

  it("US-EQU-03 the latest measurement is the newest date; the log keeps all, newest first", async () => {
    const id = await lamp();
    await measure(id, { measuredOn: "2026-10-05", lux: 9000 });
    await measure(id, { measuredOn: "2026-09-01", lux: 14000 });
    const { lamps } = await view();
    expect(lamps[0]?.last?.lux).toBe(9000);
    expect(lamps[0]?.measurements.map((m) => m.measuredOn)).toEqual(["2026-10-05", "2026-09-01"]);
  });

  it("US-EQU-03 shows Check zone only above the limit the keeper set, below or above the ceiling", async () => {
    const id = await lamp();
    await measure(id, { lux: 6000 });
    expect((await view()).lamps[0]?.check).toBeNull();
    const set = equipmentSetDeviationLimit({ limits: log });
    expect(await run(set, { percent: 20 })).toMatchObject({ ok: true, value: { percent: 20 } });
    const { lamps, limit } = await view();
    expect(limit).toBe(20);
    expect(lamps[0]?.check).toMatchObject({ deviationPercent: 60 });
    expect(lamps[0]?.check?.text).toContain("6.000 lx");
    expect(lamps[0]?.check?.nextAction).not.toBe("");
    await measure(id, { measuredOn: "2026-10-02", lux: 16000 });
    expect((await view()).lamps[0]?.check).toBeNull();
    await measure(id, { measuredOn: "2026-10-03", lux: 25000 });
    expect((await view()).lamps[0]?.check).toMatchObject({ deviationPercent: 67 });
    expect(await run(set, { percent: null })).toMatchObject({ ok: true, value: { percent: null } });
    expect((await view()).lamps[0]?.check).toBeNull();
  });

  it("US-EQU-03 refuses invalid input and writes nothing", async () => {
    const id = await lamp();
    for (const bad of [
      { lux: 0 },
      { lux: 12.5 },
      { lux: undefined },
      { measuredOn: "2026-02-30" },
      { measuredOn: undefined },
      { distanceCm: 0 },
      { method: "" },
    ]) {
      expect(await measure(id, bad)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
    expect(log.rows).toHaveLength(0);
    const set = equipmentSetDeviationLimit({ limits: log });
    expect(await run(set, { percent: 0 })).toMatchObject({ ok: false });
    expect(await run(set, { percent: 101 })).toMatchObject({ ok: false });
  });

  it("US-EQU-03 only lamps are measured and described; a foreign or unknown record looks missing (P-04)", async () => {
    const pot = await run(equipmentRecord({ equipment }), { type: "Pot", name: "Topf" });
    const potId = pot.ok ? pot.value.id : "";
    expect(await measure(potId)).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_lamp" },
    });
    expect(await measure(equipmentId(99))).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    const describe = equipmentDescribeLamp({ equipment });
    expect(await run(describe, { id: potId, powerW: 1, luxStatement: 1 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_lamp" },
    });
    expect(await run(describe, { id: equipmentId(99), powerW: 1, luxStatement: 1 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    const id = await lamp();
    expect(await run(describe, { id, powerW: 40 }, { userId: "ben" })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    expect((await view()).lamps.find((l) => l.id === id)?.powerW).toBeNull();
  });

  it("US-EQU-03 clearing a manufacturer value sets it back to unknown", async () => {
    const id = await lamp();
    const describe = equipmentDescribeLamp({ equipment });
    await run(describe, { id, powerW: 40, luxStatement: 20000 });
    await run(describe, { id });
    expect((await view()).lamps[0]).toMatchObject({ powerW: null, manufacturerLux: null });
  });
});
