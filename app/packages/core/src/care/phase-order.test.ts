import { describe, expect, it } from "vitest";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../collection/test-helpers";
import { InMemoryCareProfiles } from "../collection/care-profile-test-helpers";
import { carePhasesList, phaseStatus } from "./index";
import { PhaseLocationStub } from "./test-helpers";

const WINTER = "11111111-1111-4111-8111-111111111111"; // Dormancy 11-01 to 03-15
const COLD = "66666666-6666-4666-8666-666666666666";
const WARM = "77777777-7777-4777-8777-777777777777";
const BEN_COLD = "88888888-8888-4888-8888-888888888888";

const species = new SpeciesStub([
  {
    species: testSpecies(WINTER, {
      germanName: "Bogenhanf",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    }),
  },
]);

const targets = new PhaseLocationStub({
  anna: { [WINTER]: { dormancy: COLD, growth: WARM } },
  ben: { [WINTER]: { dormancy: BEN_COLD } },
});

async function setup(
  rows: { name: string; location: string | null; user?: string }[],
): Promise<InMemorySpecimens> {
  const store = new InMemorySpecimens({ anna: [COLD, WARM], ben: [BEN_COLD] });
  for (const z of rows)
    await store.create(z.user ?? "anna", {
      speciesId: WINTER,
      name: z.name,
      marker: null,
      locationId: z.location,
      caughtAt: "2026-01-01",
    });
  return store;
}

const names = async (store: InMemorySpecimens, userId = "anna") => {
  const r = await carePhasesList(
    {
      specimens: store,
      species,
      targets,
      profiles: new InMemoryCareProfiles(),
      clock: () => new Date("2026-12-01T12:00:00Z"),
    },
    userId,
    "UTC",
  );
  return r.ok ? r.value.map((z) => z.name) : r;
};

describe("US-PHA-02 deviation of a row", () => {
  it("US-PHA-02 deviation = the location id differs from the target location id", () => {
    expect(phaseStatus({ locationId: WARM, targetLocationId: COLD })).toBe("deviation");
    expect(phaseStatus({ locationId: COLD, targetLocationId: COLD })).toBe("in_place");
  });

  it("US-PHA-02 an unknown target is never a deviation (P-08)", () => {
    expect(phaseStatus({ locationId: WARM, targetLocationId: null })).toBe("in_place");
  });

  it("US-PHA-02 a specimen without a location is its own warning, not a deviation", () => {
    expect(phaseStatus({ locationId: null, targetLocationId: COLD })).toBe("location_missing");
    expect(phaseStatus({ locationId: null, targetLocationId: null })).toBe("location_missing");
  });
});

describe("US-PHA-02 deviations first", () => {
  it("US-PHA-02 rows with a deviation come before rows without, by name inside each group", async () => {
    const store = await setup([
      { name: "A am Soll", location: COLD },
      { name: "B falsch", location: WARM },
      { name: "C ohne Standort", location: null },
      { name: "D am Soll", location: COLD },
      { name: "E falsch", location: WARM },
    ]);
    expect(await names(store)).toEqual([
      "B falsch",
      "E falsch",
      "C ohne Standort",
      "A am Soll",
      "D am Soll",
    ]);
  });

  it("US-PHA-02 without any deviation the order stays alphabetical", async () => {
    const store = await setup([
      { name: "Zwei", location: COLD },
      { name: "Eins", location: COLD },
    ]);
    expect(await names(store)).toEqual(["Eins", "Zwei"]);
  });

  it("US-PHA-02 another account's specimens neither appear nor change the order (P-04)", async () => {
    const store = await setup([
      { name: "Anna am Soll", location: COLD },
      { name: "Ben falsch", location: null, user: "ben" },
    ]);
    expect(await names(store)).toEqual(["Anna am Soll"]);
    expect(await names(store, "ben")).toEqual(["Ben falsch"]);
  });
});
