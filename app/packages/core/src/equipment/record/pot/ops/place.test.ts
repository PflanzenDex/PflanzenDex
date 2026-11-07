import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../../kernel";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import { equipmentPlacePot } from "./place";
import { makePlant, makePot, PRIMARY, world } from "../test-helpers-world";

let w: ReturnType<typeof world>;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let switchedOff = false;

const place = (input: Record<string, unknown>, userId = PRIMARY, clock = "2026-11-07T10:00:00Z") =>
  execute(
    equipmentPlacePot({
      specimens: w.specimens,
      pots: w.placements,
      clock: () => new Date(clock),
      keeperOff: async () => switchedOff,
    }),
    { idempotency: idem },
    {
      context: { userId },
      input: { timeZone: "Europe/Berlin", ...input },
      idempotencyKey: `k${++counter}`,
    },
  );

beforeEach(() => {
  w = world();
  idem = new InMemoryIdempotencyStore();
  switchedOff = false;
});

describe("US-BES-19 a plant goes into one of the keeper's pots (DM-EQU-06)", () => {
  it("US-BES-19: a free active pot takes the plant on the local day and the placement is open", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    const r = await place({ specimenId: plant, potId: pot });
    expect(r).toMatchObject({
      ok: true,
      value: { potId: pot, placedOn: "2026-11-07", changed: true },
    });
    expect(await w.placements.currentPot(PRIMARY, plant)).toEqual({
      id: pot,
      name: "Topf 12",
      diameterCm: 12,
    });
  });

  it("US-BES-19: moving a plant closes the old placement on that day, the old pot is free again", async () => {
    const first = await makePot(w.equipment, PRIMARY, "Topf klein", 10);
    const second = await makePot(w.equipment, PRIMARY, "Topf groß", 16);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    await place({ specimenId: plant, potId: first, date: "2026-10-01" });
    expect((await place({ specimenId: plant, potId: second })).ok).toBe(true);
    expect(w.placements.placements.map((p) => [p.potId, p.placedOn, p.leftOn])).toEqual([
      [first, "2026-10-01", "2026-11-07"],
      [second, "2026-11-07", null],
    ]);
    expect((await w.placements.freePots(PRIMARY)).map((p) => p.id)).toEqual([first]);
  });

  it("US-BES-19: the same pot again changes nothing, and taking a plant out closes its placement", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    await place({ specimenId: plant, potId: pot });
    const before = w.placements.writes;
    expect(await place({ specimenId: plant, potId: pot })).toMatchObject({
      ok: true,
      value: { changed: false },
    });
    expect(w.placements.writes).toBe(before);
    expect(await place({ specimenId: plant, potId: null })).toMatchObject({
      ok: true,
      value: { potId: null, changed: true },
    });
    expect(await w.placements.currentPot(PRIMARY, plant)).toBeNull();
  });

  it("US-BES-19: a pot another active plant holds is refused as taken, and nothing is written", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const holder = await makePlant(w.specimens, PRIMARY, "Schon drin");
    const plant = await makePlant(w.specimens, PRIMARY, "Neu");
    await place({ specimenId: holder, potId: pot });
    const before = w.placements.writes;
    const r = await place({ specimenId: plant, potId: pot });
    expect(!r.ok && r.error.code).toBe("equipment.pot_taken");
    expect(w.placements.writes).toBe(before);
    expect(await w.placements.currentPot(PRIMARY, plant)).toBeNull();
  });

  it("US-BES-19: an archived plant frees its pot without a write on archiving; the next plant takes it and closes the stale placement", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const old = await makePlant(w.specimens, PRIMARY, "Alt");
    const next = await makePlant(w.specimens, PRIMARY, "Neu");
    await place({ specimenId: old, potId: pot, date: "2026-10-01" });
    await w.specimens.archive(PRIMARY, old, "abgegeben", "2026-10-15");
    expect((await w.placements.freePots(PRIMARY)).map((p) => p.id)).toEqual([pot]);
    expect((await place({ specimenId: next, potId: pot })).ok).toBe(true);
    expect(w.placements.placements[0]).toMatchObject({ specimenId: old, leftOn: "2026-11-07" });
    expect(await w.placements.currentPot(PRIMARY, old)).toBeNull();
  });

  it("US-BES-19: a pot that is not active, not a pot, foreign or unknown is pot_not_found and nothing is written", async () => {
    const defective = await makePot(w.equipment, PRIMARY, "Kaputt", 12);
    await w.equipment.setStatus(PRIMARY, defective, "defective");
    const lamp = await w.equipment.create(
      PRIMARY,
      {
        type: "Lamp",
        name: "Lampe",
        manufacturer: null,
        model: null,
        productId: null,
        priceEur: null,
        boughtAt: null,
        note: null,
        lightZoneId: null,
        diameterCm: null,
        heightCm: null,
        material: null,
        drainage: null,
      },
      "active",
    );
    if (typeof lamp === "string") throw new Error(lamp);
    const foreign = await makePot(w.equipment, "ben", "Fremd", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    for (const potId of [defective, lamp.id, foreign, "00000000-0000-4000-8000-0000000000ff"]) {
      const r = await place({ specimenId: plant, potId });
      expect(!r.ok && r.error.code).toBe("equipment.pot_not_found");
    }
    expect(w.placements.placements).toEqual([]);
  });

  it("US-BES-19: a cutting cannot be placed yet (potted out first), an archived plant and a foreign plant are refused", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const cutting = await makePlant(w.specimens, PRIMARY, "Steckling", "cutting");
    const potted = await place({ specimenId: cutting, potId: pot });
    expect(!potted.ok && potted.error.code).toBe("equipment.not_a_plant");
    const archived = await makePlant(w.specimens, PRIMARY, "Archiv");
    await w.specimens.archive(PRIMARY, archived, "abgegeben", "2026-10-01");
    const r = await place({ specimenId: archived, potId: pot });
    expect(!r.ok && r.error.code).toBe("specimen.archived");
    const foreign = await makePlant(w.specimens, "ben", "Fremd");
    const other = await place({ specimenId: foreign, potId: pot });
    expect(!other.ok && other.error.code).toBe("specimen.not_found");
    expect(w.placements.placements).toEqual([]);
  });

  it("US-BES-19: a future day is refused like a repot's, and an invalid time zone is input.invalid", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    const future = await place({ specimenId: plant, potId: pot, date: "2026-11-08" });
    expect(!future.ok && future.error.code).toBe("specimen.repotted_in_future");
    const zone = await place({ specimenId: plant, potId: pot, timeZone: "Mars/Base" });
    expect(!zone.ok && zone.error.code).toBe("input.invalid");
    expect(w.placements.placements).toEqual([]);
  });

  it("US-BES-19, P-12: while the equipment switch is off a pot is refused, taking a plant out stays possible", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    await place({ specimenId: plant, potId: pot });
    switchedOff = true;
    const r = await place({ specimenId: plant, potId: null });
    expect(r.ok).toBe(true);
    const off = await place({ specimenId: plant, potId: pot });
    expect(!off.ok && off.error.code).toBe("onboarding.keeper_off");
  });
});

describe("US-BES-19 the free pots (US-EQU-01, P-04)", () => {
  it("US-BES-19: free means active and not held by a plant that is not archived; pots are listed by name", async () => {
    const b = await makePot(w.equipment, PRIMARY, "Topf B", 14);
    const a = await makePot(w.equipment, PRIMARY, "Topf A", 10);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    await place({ specimenId: plant, potId: b });
    expect((await w.placements.freePots(PRIMARY)).map((p) => p.id)).toEqual([a]);
    expect((await w.placements.freePots("ben")).map((p) => p.id)).toEqual([]);
  });
});
