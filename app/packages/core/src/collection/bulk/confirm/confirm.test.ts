import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { NO_TARGET_LOCATION } from "../../placement/target-location";
import {
  InMemoryLocations,
  InMemorySpecimens,
  SpeciesStub,
  testSpecies,
} from "../../shared/test-helpers";
import { specimenImport } from "./confirm";
import type { ConfirmDependencies } from "./types";

// US-BES-18 (FR-BES-26): the confirmation writes the rows the keeper confirmed, each through the validating operation for
// specimens (P-03); a refused row does not stop the others, and a repeat creates nothing twice.
const MONSTERA = "11111111-1111-4111-8111-111111111111";
const FICUS = "22222222-2222-4222-8222-222222222222";
const DRACAENA = "33333333-3333-4333-8333-333333333333";
const PRIVATE = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-11-07T10:00:00Z");

let locations: InMemoryLocations;
let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let fenster: string;
let foreign: string;
let off: boolean;
let counter = 0;

const species = new SpeciesStub([
  {
    species: testSpecies(MONSTERA, { latinName: "Monstera deliciosa", germanName: "Fensterblatt" }),
  },
  { species: testSpecies(FICUS, { latinName: "Ficus lyrata", germanName: "Geigenfeige" }) },
  { species: testSpecies(DRACAENA) },
  { species: testSpecies(PRIVATE, { germanName: "Herzblatt" }), only: "ben" },
]);

const deps = (): ConfirmDependencies => ({
  specimens,
  locations,
  species,
  targetLocation: NO_TARGET_LOCATION,
  clock: () => NOW,
  keeperOff: async () => off,
});

const confirm = (input: Record<string, unknown>, key = `k${++counter}`) =>
  execute(
    specimenImport(deps()),
    { idempotency: idem },
    {
      context: { userId: "anna" },
      input: { timeZone: "Europe/Berlin", ...input },
      idempotencyKey: key,
    },
  );

const row = (line: number, over: Record<string, unknown> = {}) => ({
  line,
  speciesId: MONSTERA,
  marker: null,
  locationId: null,
  newLocation: null,
  catchDate: null,
  notes: null,
  ...over,
});

beforeEach(async () => {
  locations = new InMemoryLocations();
  fenster = (
    (await locations.create("anna", { name: "Fenster", kind: "indoor", lightZoneId: null })) as {
      id: string;
    }
  ).id;
  foreign = (
    (await locations.create("ben", { name: "Garten", kind: "outdoor", lightZoneId: null })) as {
      id: string;
    }
  ).id;
  // The locations the specimens may point to are read live, so a location created by the import is known (the foreign key).
  const known = (userId: string) =>
    locations.rows.filter((r) => r.userId === userId).map((r) => r.id);
  specimens = new InMemorySpecimens({
    get anna() {
      return known("anna");
    },
    get ben() {
      return known("ben");
    },
  });
  idem = new InMemoryIdempotencyStore();
  off = false;
});

const nameOf = (id: string) => specimens.rows.find((z) => z.id === id)?.name;

describe("US-BES-18 confirmation writes the confirmed rows", () => {
  it("US-BES-18 a row is created with its marker, location, date and notes; the name follows the naming rule", async () => {
    const r = await confirm({
      rows: [
        row(2, {
          marker: "Lulu",
          locationId: fenster,
          catchDate: "2026-03-01",
          notes: "vom Markt",
        }),
      ],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 2, name: "Fensterblatt – Lulu" }] },
    });
    const stored = specimens.rows[0];
    expect(stored).toMatchObject({
      name: "Fensterblatt – Lulu",
      marker: "Lulu",
      locationId: fenster,
      caughtAt: "2026-03-01",
      status: "plant",
    });
    expect(specimens.notesOf(stored?.id ?? "")).toBe("vom Markt");
  });

  it("US-BES-18 a new location is created once, as an indoor location without a light zone, and used by every row", async () => {
    const r = await confirm({
      rows: [
        row(2, { newLocation: "Balkon" }),
        row(3, { speciesId: FICUS, newLocation: "balkon" }),
      ],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 2 }, { line: 3 }], locationsCreated: ["Balkon"] },
    });
    const balcony = locations.rows.filter((l) => l.name === "Balkon");
    expect(balcony).toHaveLength(1);
    expect(balcony[0]).toMatchObject({ kind: "indoor", lightZoneId: null });
    expect(specimens.rows.map((z) => z.locationId)).toEqual([balcony[0]?.id, balcony[0]?.id]);
  });

  it("US-BES-18 an existing location of the keeper is used, not created again (the name is matched without case)", async () => {
    const r = await confirm({ rows: [row(2, { newLocation: "FENSTER" })] });
    expect(r).toMatchObject({ ok: true, value: { created: [{ line: 2 }], locationsCreated: [] } });
    expect(specimens.rows[0]?.locationId).toBe(fenster);
    expect(locations.rows.filter((l) => l.userId === "anna")).toHaveLength(1);
  });

  it("US-BES-18 a future catch date is refused on its row, nothing else changes (FR-BES-04)", async () => {
    const r = await confirm({
      rows: [row(2, { catchDate: "2026-11-08" }), row(3, { speciesId: FICUS })],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 3 }], refused: [{ line: 2, code: "specimen.caught_in_future" }] },
    });
  });
});

describe("US-BES-18 a repeat creates nothing twice and a refused row does not stop the others", () => {
  it("US-BES-18 importing the same rows again skips them: the specimen name is there already", async () => {
    const rows = [row(2, { marker: "Lulu" })];
    await confirm({ rows });
    const again = await confirm({ rows });
    expect(again).toMatchObject({ ok: true, value: { created: [], skipped: [{ line: 2 }] } });
    expect(specimens.rows).toHaveLength(1);
  });

  it("US-BES-18 the same idempotency key answers the first result and writes nothing new", async () => {
    const input = { rows: [row(2)] };
    const first = await confirm(input, "same-key");
    const second = await confirm(input, "same-key");
    expect(second).toEqual(first);
    expect(specimens.rows).toHaveLength(1);
  });

  it("US-BES-18 a row with a location of another keeper is refused, the rows after it are written", async () => {
    const r = await confirm({
      rows: [
        row(2, { locationId: foreign }),
        row(3, { speciesId: FICUS }),
        row(4, { speciesId: DRACAENA }),
      ],
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        created: [{ line: 3 }, { line: 4 }],
        refused: [{ line: 2, code: "location.not_found" }],
      },
    });
  });

  it("US-BES-18 a species the account does not see is refused on its row (P-04)", async () => {
    const r = await confirm({
      rows: [row(2, { speciesId: PRIVATE }), row(3, { speciesId: FICUS })],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 3 }], refused: [{ line: 2, code: "species.not_found" }] },
    });
  });
});

describe("US-BES-18 the answers for existing specimens reach the row that makes the third (US-BES-03)", () => {
  const existingDracaena = async () => {
    const r = await specimens.create("anna", {
      speciesId: DRACAENA,
      name: "Bogenhanf",
      marker: null,
      locationId: null,
      lightZoneId: null,
      caughtAt: "2026-10-01",
      status: "plant",
    });
    if (typeof r !== "object") throw new Error("seed");
    return r.id;
  };

  it("US-BES-18 with the answer the third plant is created and the unmarked plant gets its marker", async () => {
    const id = await existingDracaena();
    const r = await confirm({
      rows: [
        row(2, { speciesId: DRACAENA, marker: "a" }),
        row(3, { speciesId: DRACAENA, marker: "b" }),
      ],
      markers: [{ specimenId: id, marker: "c" }],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 2 }, { line: 3 }], refused: [], unusedMarkers: [] },
    });
    expect(nameOf(id)).toBe("Bogenhanf – c");
  });

  it("US-BES-18 without the answer the row that needs it is refused (markers missing), the other rows are written", async () => {
    await existingDracaena();
    const r = await confirm({
      rows: [
        row(2, { speciesId: DRACAENA, marker: "a" }),
        row(3, { speciesId: DRACAENA, marker: "b" }),
      ],
    });
    expect(r).toMatchObject({
      ok: true,
      value: { created: [{ line: 2 }], refused: [{ line: 3, code: "specimen.markers_missing" }] },
    });
  });

  it("US-BES-18 an answer for a specimen the import does not write is refused before anything is written", async () => {
    const id = await existingDracaena();
    const r = await confirm({ rows: [row(2)], markers: [{ specimenId: id, marker: "c" }] });
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    expect(specimens.writes).toBe(1); // only the seeded plant
  });

  it("US-BES-18 an answer no row needed is reported as unused, not dropped silently (P-10)", async () => {
    const id = await existingDracaena();
    const r = await confirm({
      rows: [row(2, { speciesId: DRACAENA, marker: "a" })],
      markers: [{ specimenId: id, marker: "c" }],
    });
    expect(r).toMatchObject({ ok: true, value: { created: [{ line: 2 }], unusedMarkers: [id] } });
    expect(nameOf(id)).toBe("Bogenhanf");
  });
});

describe("US-BES-18 refusals before anything is written", () => {
  it("US-BES-18 while the switch is off nothing is written (onboarding.keeper_off, P-12)", async () => {
    off = true;
    const r = await confirm({ rows: [row(2)] });
    expect(r).toMatchObject({ ok: false, error: { code: "onboarding.keeper_off" } });
    expect(specimens.writes).toBe(0);
  });

  it("US-BES-18 a row with both a location ID and a new location name is refused as a whole", async () => {
    const r = await confirm({ rows: [row(2, { locationId: fenster, newLocation: "Balkon" })] });
    expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(specimens.writes).toBe(0);
  });

  it("US-BES-18 more than 500 rows are refused as a whole (FR-BES-26)", async () => {
    const many = Array.from({ length: 501 }, (_, i) => row(i + 2, { marker: `m${i}` }));
    const r = await confirm({ rows: many });
    expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(specimens.writes).toBe(0);
  });
});
