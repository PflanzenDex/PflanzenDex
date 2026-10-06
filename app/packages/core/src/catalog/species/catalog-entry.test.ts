import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { speciesPropose } from "./index";
import { InMemorySpecies } from "./test-helpers";

let store: InMemorySpecies;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const profile = {
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  growthMeasure: "height",
  etiolationSigns: "Blätter werden schmal.",
  successCriteria: "Neue Blätter wachsen aufrecht.",
};
const propose = (input: Record<string, unknown>) =>
  execute(
    speciesPropose(store),
    { idempotency: idem },
    {
      context: { userId: "anna" },
      input: { ...profile, ...input },
      idempotencyKey: `k${++counter}`,
    },
  );

beforeEach(() => {
  store = new InMemorySpecies();
  idem = new InMemoryIdempotencyStore();
});

describe("US-POK-02 catalog entry: names are normalized, rating limits warn per field", () => {
  it("normalizes `ficus BENJAMINA` to `Ficus benjamina`", async () => {
    const r = await propose({ latinName: "ficus BENJAMINA" });
    expect(r.ok && r.value.latinName).toBe("Ficus benjamina");
  });

  it("drops a duplicate: the second entry with the same normalized name creates nothing", async () => {
    await propose({ latinName: "Ficus benjamina" });
    const r = await propose({ latinName: "ficus BENJAMINA" });
    expect(!r.ok && r.error.code).toBe("species.duplicate");
    expect(store.rows).toHaveLength(1);
  });

  it("names the invalid rating on its field (difficulty outside 1-3, light level outside 2-4)", async () => {
    const r = await propose({ difficulty: 4, standardLevel: 1 });
    expect(!r.ok && r.error.details?.map((d) => d.field).sort()).toEqual([
      "difficulty",
      "standardLevel",
    ]);
  });
});

describe("US-POK-02 hybrid signs and additions do not belong in the catalog (US-POK-06)", () => {
  it.each(["Citrus x limon", "Citrus × limon", "×Fatshedera lizei", "Citrus X limon"])(
    "refuses the hybrid sign in %j with its own code on latinName",
    async (latinName) => {
      const r = await propose({ latinName });
      expect(!r.ok && r.error.details).toEqual([
        { field: "latinName", code: "catalog.name_hybrid" },
      ]);
      expect(store.rows).toHaveLength(0);
    },
  );

  it.each([
    "Aloe vera var. chinensis",
    "Aloe vera subsp. x",
    "Aloe vera f. alba",
    "Aloe vera cv. Foo",
  ])("refuses the addition in %j with its own code on latinName", async (latinName) => {
    const r = await propose({ latinName });
    expect(!r.ok && r.error.details).toEqual([
      { field: "latinName", code: "catalog.name_addition" },
    ]);
  });

  it("keeps plain invalid names on the generic code", async () => {
    const r = await propose({ latinName: "123" });
    expect(!r.ok && r.error.details).toEqual([{ field: "latinName", code: "input.invalid" }]);
  });

  it("does not mistake a species epithet starting with x for a hybrid sign", async () => {
    const r = await propose({ latinName: "Aloe xanthacantha" });
    expect(r.ok).toBe(true);
  });
});
