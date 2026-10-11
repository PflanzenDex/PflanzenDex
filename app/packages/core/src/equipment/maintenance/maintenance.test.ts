import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { equipmentMeasure } from "../lamps";
import { equipmentRecord } from "../record";
import { equipmentSetStatus } from "../status";
import { InMemoryEquipment, InMemoryLampLog } from "../store/test-helpers";
import { equipmentChecksDue, equipmentMarkChecked, equipmentSetMaintenance } from "./index";

const Z2 = "00000000-0000-4000-8000-0000000000a2";
const anna = { userId: "anna" };
const bert = { userId: "bert" };
let equipment: InMemoryEquipment;
let log: InMemoryLampLog;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });
const record = async (type: string, name: string, extra: Record<string, unknown> = {}) => {
  const r = await run(equipmentRecord({ equipment }), { type, name, ...extra });
  return r.ok ? r.value.id : "";
};
const maintain = (id: string, extra: Record<string, unknown> = {}, context = anna) =>
  run(equipmentSetMaintenance({ equipment }), { id, ...extra }, context);
const due = (today: string, userId = "anna") =>
  equipmentChecksDue({ equipment, measurements: log }, userId, today);

beforeEach(() => {
  equipment = new InMemoryEquipment({ anna: [Z2] });
  log = new InMemoryLampLog(equipment);
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-04 operation and maintenance", () => {
  it("US-EQU-04 keeps In_Operation_Since and Check_Interval_Days when the keeper sets them", async () => {
    const id = await record("Timer", "Timer A");
    const r = await maintain(id, { inOperationSince: "2026-01-10", checkIntervalDays: 90 });
    expect(r).toMatchObject({
      ok: true,
      value: { inOperationSince: "2026-01-10", checkIntervalDays: 90 },
    });
  });

  it("US-EQU-04 a device without an interval has no due date and never shows 'Check due'", async () => {
    const id = await record("Timer", "Timer A");
    await maintain(id, { inOperationSince: "2020-01-01" });
    expect(await due("2026-10-11")).toEqual([]);
  });

  it("US-EQU-04 'Check due' appears once the last check is older than the interval", async () => {
    const id = await record("Timer", "Timer A");
    await maintain(id, { checkIntervalDays: 30 });
    await run(equipmentMarkChecked({ equipment }), { id, checkedOn: "2026-09-01" });
    expect(await due("2026-09-30")).toEqual([]);
    expect(await due("2026-10-01")).toMatchObject([
      { id, name: "Timer A", lastCheckedOn: "2026-09-01", overdueDays: 0 },
    ]);
    expect(await due("2026-10-11")).toMatchObject([{ overdueDays: 10 }]);
  });

  it("US-EQU-04 without a check the date of In_Operation_Since starts the interval", async () => {
    const id = await record("Pump", "Pumpe");
    await maintain(id, { inOperationSince: "2026-08-01", checkIntervalDays: 60 });
    expect(await due("2026-09-29")).toEqual([]);
    expect(await due("2026-09-30")).toMatchObject([{ id, lastCheckedOn: null }]);
  });

  it("US-EQU-04 an interval without any check or start date counts as never checked and is due", async () => {
    const id = await record("Sensor", "Sensor A");
    await maintain(id, { checkIntervalDays: 365 });
    expect(await due("2026-10-11")).toMatchObject([{ id, lastCheckedOn: null, overdueDays: null }]);
  });

  it("US-EQU-04 for a lamp the last measurement is the last check", async () => {
    const id = await record("Lamp", "Lampe A", { lightZoneId: Z2 });
    await maintain(id, { checkIntervalDays: 30 });
    expect(await due("2026-10-11")).toHaveLength(1);
    await run(equipmentMeasure({ measurements: log }), {
      equipmentId: id,
      measuredOn: "2026-10-05",
      lux: 9000,
    });
    expect(await due("2026-10-11")).toEqual([]);
    expect(await due("2026-11-04")).toMatchObject([{ lastCheckedOn: "2026-10-05" }]);
  });

  it("US-EQU-04 a defective or retired device is not reported as due", async () => {
    const id = await record("Timer", "Timer A");
    await maintain(id, { checkIntervalDays: 30 });
    await run(equipmentSetStatus({ equipment }), { id, status: "defective" });
    expect(await due("2026-10-11")).toEqual([]);
  });

  it("US-EQU-04 the lifetime is kept only as a statement with its source (P-08)", async () => {
    const id = await record("Lamp", "Lampe A", { lightZoneId: Z2 });
    expect(
      await maintain(id, { lifetimeValue: "50.000 Stunden", lifetimeSource: "Datenblatt" }),
    ).toMatchObject({
      ok: true,
      value: { lifetimeValue: "50.000 Stunden", lifetimeSource: "Datenblatt" },
    });
    const noSource = await maintain(id, { lifetimeValue: "50.000 Stunden" });
    expect(noSource).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    const noValue = await maintain(id, { lifetimeSource: "Datenblatt" });
    expect(noValue).toMatchObject({ ok: false, error: { code: "input.invalid" } });
  });

  it("US-EQU-04 setting again without a value clears it back to unknown", async () => {
    const id = await record("Timer", "Timer A");
    await maintain(id, { checkIntervalDays: 30, inOperationSince: "2026-01-01" });
    const r = await maintain(id, {});
    expect(r).toMatchObject({
      ok: true,
      value: { checkIntervalDays: null, inOperationSince: null },
    });
  });

  it("US-EQU-04 rejects an interval outside the limits and a malformed date", async () => {
    const id = await record("Timer", "Timer A");
    expect(await maintain(id, { checkIntervalDays: 0 })).toMatchObject({ ok: false });
    expect(await maintain(id, { checkIntervalDays: 4000 })).toMatchObject({ ok: false });
    expect(await maintain(id, { inOperationSince: "10.01.2026" })).toMatchObject({ ok: false });
  });

  it("US-EQU-04 a consumable has no operation data and no check", async () => {
    const id = await record("Substrate", "Erde");
    expect(await maintain(id, { checkIntervalDays: 30 })).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_device" },
    });
    expect(
      await run(equipmentMarkChecked({ equipment }), { id, checkedOn: "2026-10-01" }),
    ).toMatchObject({ ok: false, error: { code: "equipment.not_a_device" } });
  });

  it("US-EQU-04 an unknown id gives equipment.not_found", async () => {
    expect(
      await maintain("00000000-0000-4000-8000-000000000999", { checkIntervalDays: 30 }),
    ).toMatchObject({ ok: false, error: { code: "equipment.not_found" } });
  });

  it("US-EQU-04 one keeper never sees or changes the maintenance of another (P-04)", async () => {
    const id = await record("Timer", "Timer A");
    await maintain(id, { checkIntervalDays: 30 });
    expect(await due("2026-10-11", "bert")).toEqual([]);
    expect(await maintain(id, { checkIntervalDays: 1 }, bert)).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
  });
});
