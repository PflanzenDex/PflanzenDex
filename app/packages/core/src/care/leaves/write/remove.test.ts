import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { leafRecord, leafRemove } from "../../index";
import { SpecimenStub } from "../../shared/test-helpers";
import { InMemoryLeaves } from "../../shared/leaf-test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-02T23:30:00Z");

let leaves: InMemoryLeaves;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let switchedOff = false;

const deps = () => ({
  leaves,
  specimens: new SpecimenStub({ anna: [E1], ben: [E2] }),
  keeperOff: async () => switchedOff,
  clock: () => NOW,
});
const add = async (specimenId: string, context = anna) => {
  const r = await execute(
    leafRecord(deps()),
    { idempotency: idem },
    {
      context,
      input: { specimenId, timeZone: "Europe/Berlin", lengthMm: 25 },
      idempotencyKey: `add${++counter}`,
    },
  );
  if (!r.ok) throw new Error(r.error.code);
  return r.value.id;
};
const remove = (input: unknown, context = anna) =>
  execute(
    leafRemove(deps()),
    { idempotency: idem },
    {
      context,
      input,
      idempotencyKey: `rm${++counter}`,
    },
  );

beforeEach(() => {
  leaves = new InMemoryLeaves({ anna: [E1], ben: [E2] });
  idem = new InMemoryIdempotencyStore();
  switchedOff = false;
});

describe("US-WAC-07 remove a leaf logged by mistake", () => {
  it("US-WAC-07 removing a leaf after confirmation takes it away from the store", async () => {
    const id = await add(E1);
    await add(E1);
    const r = await remove({ specimenId: E1, leafId: id });
    expect(r).toEqual({ ok: true, value: { id } });
    expect(leaves.rows.map((l) => l.id)).not.toContain(id);
    expect(leaves.rows).toHaveLength(1);
  });

  it("US-WAC-07 another account gets leaf.not_found and the leaf stays (P-04)", async () => {
    const id = await add(E1);
    const r = await remove({ specimenId: E1, leafId: id }, ben);
    expect(r).toMatchObject({ ok: false, error: { code: "leaf.not_found" } });
    expect(leaves.rows).toHaveLength(1);
  });

  it("US-WAC-07 an unknown leaf is leaf.not_found", async () => {
    const r = await remove({ specimenId: E1, leafId: "00000000-0000-4000-8000-0000000000ff" });
    expect(r).toMatchObject({ ok: false, error: { code: "leaf.not_found" } });
  });

  it("US-WAC-07 a leaf of another plant is not removed through this plant's address", async () => {
    const id = await add(E1);
    const r = await remove({ specimenId: E2, leafId: id });
    expect(r).toMatchObject({ ok: false, error: { code: "leaf.not_found" } });
    expect(leaves.rows).toHaveLength(1);
  });

  it("US-WAC-07 with the keeper switch off nothing is removed and the refusal names the switch (P-12)", async () => {
    const id = await add(E1);
    switchedOff = true;
    const r = await remove({ specimenId: E1, leafId: id });
    expect(r).toMatchObject({ ok: false, error: { code: "onboarding.keeper_off" } });
    expect(leaves.rows).toHaveLength(1);
  });
});
