import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { equipmentRecord } from "../record";
import { InMemoryEquipment, equipmentId } from "../store/test-helpers";
import { equipmentSetStatus } from "../status";
import { equipmentSetZone, equipmentZoneUsage } from "./index";

const Z1 = "00000000-0000-4000-8000-0000000000a1";
const Z2 = "00000000-0000-4000-8000-0000000000a2";
const FOREIGN = "00000000-0000-4000-8000-0000000000b1";
const anna = { userId: "anna" };
let equipment: InMemoryEquipment;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });
const record = (input: Record<string, unknown>, context = anna) =>
  run(equipmentRecord({ equipment }), input, context);
const lamp = (extra: Record<string, unknown> = {}) => ({
  type: "Lamp",
  name: "Lampe A",
  lightZoneId: Z1,
  ...extra,
});

beforeEach(() => {
  equipment = new InMemoryEquipment({ anna: [Z1, Z2], ben: [FOREIGN] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-02 bind lamps to light zones (DM-EQU-02)", () => {
  it("US-EQU-02 a lamp is recorded with exactly one light zone of the account", async () => {
    expect(await record(lamp())).toMatchObject({ ok: true, value: { lightZoneId: Z1 } });
  });

  it("US-EQU-02 refuses a lamp without a zone and another type with a zone", async () => {
    const noZone = await record(lamp({ lightZoneId: undefined }));
    expect(noZone).toMatchObject({
      ok: false,
      error: { code: "input.invalid", details: [{ field: "lightZoneId" }] },
    });
    const timerWithZone = await record({ type: "Timer", name: "T", lightZoneId: Z1 });
    expect(timerWithZone).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(equipment.rows).toHaveLength(0);
  });

  it("P-04 a zone of another account is unknown", async () => {
    expect(await record(lamp({ lightZoneId: FOREIGN }))).toMatchObject({
      ok: false,
      error: { code: "light_zone.not_found" },
    });
  });

  it("US-EQU-02 moves a lamp to another zone, only lamps and only own zones", async () => {
    const made = await record(lamp());
    const id = made.ok ? made.value.id : "";
    const set = equipmentSetZone({ equipment });
    expect(await run(set, { id, lightZoneId: Z2 })).toMatchObject({
      ok: true,
      value: { lightZoneId: Z2 },
    });
    expect(await run(set, { id, lightZoneId: FOREIGN })).toMatchObject({
      ok: false,
      error: { code: "light_zone.not_found" },
    });
    expect(await run(set, { id: equipmentId(99), lightZoneId: Z2 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    const pot = await record({ type: "Pot", name: "Topf" });
    expect(await run(set, { id: pot.ok ? pot.value.id : "", lightZoneId: Z2 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_lamp" },
    });
  });

  it("US-EQU-02 sets the state of a device, not of a consumable", async () => {
    const made = await record(lamp());
    const id = made.ok ? made.value.id : "";
    const set = equipmentSetStatus({ equipment });
    expect(await run(set, { id, status: "defective" })).toMatchObject({
      ok: true,
      value: { status: "defective" },
    });
    expect(await run(set, { id, status: "broken" })).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
    expect(await run(set, { id: equipmentId(99), status: "retired" })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    const soil = await record({ type: "Substrate", name: "Erde" });
    expect(await run(set, { id: soil.ok ? soil.value.id : "", status: "retired" })).toMatchObject({
      ok: false,
      error: { code: "equipment.no_status" },
    });
  });

  it("US-EQU-02 the zone usage names the lamps of a zone (a zone with a lamp is not deleted unnoticed)", async () => {
    await record(lamp());
    const usage = equipmentZoneUsage({ equipment });
    expect(await usage.user("anna", Z1)).toEqual([
      { kind: "equipment", id: equipmentId(1), name: "Lampe A" },
    ]);
    expect(await usage.user("anna", Z2)).toEqual([]);
    expect(await usage.user("ben", Z1)).toEqual([]);
  });
});
