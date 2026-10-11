import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { SpecimenRow } from "../../collection";
import { equipmentRecord } from "../record";
import { InMemoryEquipment } from "../store/test-helpers";
import { equipmentAssignSensor, sensorAssignments } from "./index";

const S1 = "00000000-0000-4000-8000-0000000000b1";
const L1 = "00000000-0000-4000-8000-0000000000c1";
const anna = { userId: "anna" };
const bert = { userId: "bert" };
const specimen = (extra: Partial<SpecimenRow> = {}): SpecimenRow =>
  ({
    id: S1,
    name: "Aloe",
    status: "plant",
    archivedAt: null,
    archivedReason: null,
    ...extra,
  }) as SpecimenRow;
let equipment: InMemoryEquipment;
let idem: InMemoryIdempotencyStore;
let rows: SpecimenRow[];
let counter = 0;

const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });
const record = async (type: string, name: string) => {
  const r = await run(equipmentRecord({ equipment }), { type, name });
  return r.ok ? r.value.id : "";
};
const assign = (id: string, input: Record<string, unknown>, context = anna) =>
  run(equipmentAssignSensor({ equipment }), { id, ...input }, context);
const view = (user = "anna") =>
  sensorAssignments(
    {
      equipment,
      specimens: { list: async (u: string) => (u === "anna" ? rows : []) },
      locations: {
        list: async (u: string) =>
          u === "anna" ? [{ id: L1, name: "Fenster", lightZoneId: null, kind: "indoor" }] : [],
      } as never,
    },
    user,
  );

beforeEach(() => {
  equipment = new InMemoryEquipment({}, { anna: { specimens: [S1], locations: [L1] } });
  idem = new InMemoryIdempotencyStore();
  rows = [specimen()];
});

describe("US-EQU-06 sensors and accessories", () => {
  it("US-EQU-06 a sensor is assigned to a specimen or to a location and listed there", async () => {
    const id = await record("Sensor", "Feuchtesensor");
    expect(await view()).toMatchObject({ sensors: [{ id, target: null }] });
    expect(await assign(id, { specimenId: S1 })).toMatchObject({
      ok: true,
      value: { assignedSpecimenId: S1, assignedLocationId: null },
    });
    expect((await view()).sensors[0]?.target).toEqual({ kind: "specimen", id: S1, name: "Aloe" });
    await assign(id, { locationId: L1 });
    expect((await view()).sensors[0]?.target).toEqual({
      kind: "location",
      id: L1,
      name: "Fenster",
    });
  });

  it("US-EQU-06 the assignment is optional and can be removed", async () => {
    const id = await record("Sensor", "Feuchtesensor");
    await assign(id, { specimenId: S1 });
    expect(await assign(id, {})).toMatchObject({
      ok: true,
      value: { assignedSpecimenId: null, assignedLocationId: null },
    });
    expect((await view()).sensors[0]?.target).toBeNull();
  });

  it("US-EQU-06 a sensor sits in one place only: specimen and location together are refused", async () => {
    const id = await record("Sensor", "Feuchtesensor");
    expect(await assign(id, { specimenId: S1, locationId: L1 })).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
  });

  it("US-EQU-06 only a sensor is assigned", async () => {
    const id = await record("Timer", "Timer A");
    expect(await assign(id, { specimenId: S1 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_sensor" },
    });
  });

  it("US-EQU-06 an unknown or foreign specimen or location looks unknown (P-04)", async () => {
    const id = await record("Sensor", "Feuchtesensor");
    const other = "00000000-0000-4000-8000-0000000000d9";
    expect(await assign(id, { specimenId: other })).toMatchObject({
      ok: false,
      error: { code: "equipment.target_unknown" },
    });
    expect(await assign(id, { locationId: other })).toMatchObject({
      ok: false,
      error: { code: "equipment.target_unknown" },
    });
    expect(await assign(id, { specimenId: S1 }, bert)).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    expect((await view("bert")).sensors).toEqual([]);
  });

  it("US-EQU-06 an archived specimen is not offered and reads as not assigned", async () => {
    const id = await record("Sensor", "Feuchtesensor");
    await assign(id, { specimenId: S1 });
    rows = [specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "dead" })];
    const v = await view();
    expect(v.specimens).toEqual([]);
    expect(v.sensors[0]?.target).toBeNull();
  });

  it("US-EQU-06 shows no sensor values (FR-MON-07)", async () => {
    await record("Sensor", "Feuchtesensor");
    expect(Object.keys((await view()).sensors[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "status",
      "target",
    ]);
  });
});
