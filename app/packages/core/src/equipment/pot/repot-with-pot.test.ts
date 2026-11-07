import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenRepotWithPot } from "./repot-with-pot";
import { makePlant, makePot, PRIMARY, world } from "./test-helpers-world";

let w: ReturnType<typeof world>;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let switchedOff = false;

const repotWithPot = (input: Record<string, unknown>, userId = PRIMARY) =>
  execute(
    specimenRepotWithPot({
      unit: w.unit,
      clock: () => new Date("2026-11-07T10:00:00Z"),
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

describe("US-BES-19 a repot names the pot, in one unit of work (US-BES-04, DM-EQU-06)", () => {
  it("US-BES-19: a cutting is potted out into its pot on the same day; the repot and the placement are recorded together", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const cutting = await makePlant(w.specimens, PRIMARY, "Steckling", "cutting");
    const r = await repotWithPot({ specimenId: cutting, potId: pot, date: "2026-11-05" });
    expect(r).toMatchObject({
      ok: true,
      value: {
        specimen: { status: "plant", repottedAt: "2026-11-05" },
        pot: { potId: pot, placedOn: "2026-11-05", changed: true },
      },
    });
    expect(w.specimens.repotLog.repots).toEqual([
      { userId: PRIMARY, specimenId: cutting, repottedOn: "2026-11-05" },
    ]);
    expect(await w.placements.currentPot(PRIMARY, cutting)).toMatchObject({ id: pot });
  });

  it("US-BES-19: a plant repotted without a pot leaves its pot: the placement closes on the repot day", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    await repotWithPot({ specimenId: plant, potId: pot });
    const r = await repotWithPot({ specimenId: plant, potId: null });
    expect(r).toMatchObject({ ok: true, value: { pot: { potId: null, changed: true } } });
    expect(w.placements.placements[0]).toMatchObject({ leftOn: "2026-11-07" });
  });

  it("US-BES-19: a taken pot refuses the whole repot: the plant is not repotted and nothing is recorded", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const holder = await makePlant(w.specimens, PRIMARY, "Hält schon");
    const plant = await makePlant(w.specimens, PRIMARY, "Neu", "cutting");
    await repotWithPot({ specimenId: holder, potId: pot });
    const r = await repotWithPot({ specimenId: plant, potId: pot });
    expect(!r.ok && r.error.code).toBe("equipment.pot_taken");
    expect((await w.specimens.find(PRIMARY, plant))?.status).toBe("cutting");
    expect(w.specimens.repotLog.repots.filter((x) => x.specimenId === plant)).toEqual([]);
    expect(w.placements.placements.filter((p) => p.specimenId === plant)).toEqual([]);
  });

  it("US-BES-19: a repot refused by its own check (day before the catch date) writes no placement", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const cutting = await makePlant(w.specimens, PRIMARY, "Steckling", "cutting");
    const r = await repotWithPot({ specimenId: cutting, potId: pot, date: "2026-08-01" });
    expect(!r.ok && r.error.code).toBe("specimen.repotted_before_caught");
    expect(w.placements.placements).toEqual([]);
    expect(w.specimens.repotLog.repots).toEqual([]);
  });

  it("US-BES-19: a plant without its day cannot name a pot (input.invalid on timeZone), and nothing is written", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const plant = await makePlant(w.specimens, PRIMARY, "Bogenhanf");
    const r = await execute(
      specimenRepotWithPot({ unit: w.unit, clock: () => new Date(), keeperOff: async () => false }),
      { idempotency: idem },
      {
        context: { userId: PRIMARY },
        input: { specimenId: plant, potId: pot },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(!r.ok && r.error.details).toEqual([{ field: "timeZone", code: "input.invalid" }]);
    expect(w.placements.placements).toEqual([]);
  });

  it("US-BES-19, P-12: with the equipment switch off a pot is refused and the plant is not repotted", async () => {
    const pot = await makePot(w.equipment, PRIMARY, "Topf 12", 12);
    const cutting = await makePlant(w.specimens, PRIMARY, "Steckling", "cutting");
    switchedOff = true;
    const r = await repotWithPot({ specimenId: cutting, potId: pot });
    expect(!r.ok && r.error.code).toBe("onboarding.keeper_off");
    expect((await w.specimens.find(PRIMARY, cutting))?.status).toBe("cutting");
  });

  it("US-BES-19: a foreign pot looks unknown and the foreign plant looks unknown (P-04)", async () => {
    const foreignPot = await makePot(w.equipment, "ben", "Fremd", 12);
    const cutting = await makePlant(w.specimens, PRIMARY, "Steckling", "cutting");
    const r = await repotWithPot({ specimenId: cutting, potId: foreignPot });
    expect(!r.ok && r.error.code).toBe("equipment.pot_not_found");
    expect((await w.specimens.find(PRIMARY, cutting))?.status).toBe("cutting");
    const foreignPlant = await makePlant(w.specimens, "ben", "Fremde Pflanze");
    const other = await repotWithPot({ specimenId: foreignPlant, potId: null });
    expect(!other.ok && other.error.code).toBe("specimen.not_found");
  });
});
