import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { equipmentRecord } from "../record";
import { InMemoryEquipment } from "../store/test-helpers";
import { equipmentLinkAgent, equipmentSetSupply, plantAgents } from "./index";

const anna = { userId: "anna" };
const bert = { userId: "bert" };
let equipment: InMemoryEquipment;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++counter}` });
const record = async (type: string, name: string) => {
  const r = await run(equipmentRecord({ equipment }), { type, name });
  return r.ok ? r.value : { id: "", supply: "?" };
};
const supply = (id: string, level: unknown, context = anna) =>
  run(equipmentSetSupply({ equipment }), { id, supply: level }, context);
const link = (id: string, agentLink: unknown, context = anna) =>
  run(equipmentLinkAgent({ equipment }), { id, agentLink }, context);

beforeEach(() => {
  equipment = new InMemoryEquipment();
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-05 consumables and supply", () => {
  it("US-EQU-05 a new consumable starts available, a device has no supply", async () => {
    expect((await record("Substrate", "Erde")).supply).toBe("available");
    expect((await record("Fertilizer", "Dünger")).supply).toBe("available");
    expect((await record("Pump", "Pumpe")).supply).toBeNull();
  });

  it("US-EQU-05 a tap sets the supply to available, low or empty", async () => {
    const { id } = await record("Fertilizer", "Dünger");
    expect(await supply(id, "low")).toMatchObject({ ok: true, value: { supply: "low" } });
    expect(await supply(id, "empty")).toMatchObject({ ok: true, value: { supply: "empty" } });
    expect(await supply(id, "available")).toMatchObject({
      ok: true,
      value: { supply: "available" },
    });
  });

  it("US-EQU-05 refuses an unknown level and changes nothing", async () => {
    const { id } = await record("Substrate", "Erde");
    expect(await supply(id, "plenty")).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
    expect(equipment.rows[0]?.supply).toBe("available");
  });

  it("US-EQU-05 a device has no supply to set", async () => {
    const { id } = await record("Timer", "Timer A");
    expect(await supply(id, "low")).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_consumable" },
    });
  });

  it("US-EQU-05 an unknown id gives equipment.not_found, another account's consumable looks unknown (P-04)", async () => {
    const { id } = await record("Substrate", "Erde");
    expect(await supply(id, "low", bert)).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
    expect(await link(id, "Neem", bert)).toMatchObject({
      ok: false,
      error: { code: "equipment.not_found" },
    });
  });

  it("US-EQU-05 a plant agent can be linked to the text of Treatment.Agent and unlinked again", async () => {
    const { id } = await record("Plant agent", "Neemöl");
    expect(await link(id, " Neemöl ")).toMatchObject({ ok: true, value: { agentLink: "Neemöl" } });
    expect(await link(id, null)).toMatchObject({ ok: true, value: { agentLink: null } });
  });

  it("US-EQU-05 only a plant agent is linked; other consumables are refused", async () => {
    const { id } = await record("Substrate", "Erde");
    expect(await link(id, "Erde")).toMatchObject({
      ok: false,
      error: { code: "equipment.not_a_plant_agent" },
    });
  });

  it("US-EQU-05 lists the plant agents of the account with supply and link, by name", async () => {
    const a = await record("Plant agent", "Spiritus");
    await record("Plant agent", "Neemöl");
    await record("Substrate", "Erde");
    await link(a.id, "Spiritus 70 %");
    await supply(a.id, "low");
    const list = await plantAgents({ equipment }, "anna");
    expect(list.map((p) => [p.name, p.supply, p.agentLink])).toEqual([
      ["Neemöl", "available", null],
      ["Spiritus", "low", "Spiritus 70 %"],
    ]);
    expect(await plantAgents({ equipment }, "bert")).toEqual([]);
  });
});
