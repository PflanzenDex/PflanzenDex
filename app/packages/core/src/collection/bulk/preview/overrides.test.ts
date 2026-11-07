import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryImportSpecies,
  InMemoryLocations,
  InMemorySpecimens,
} from "../../shared/test-helpers";
import { specimenImportPreview, type PreviewDependencies } from "./preview";
import { IMPORT_LIMITS, type SpeciesCandidate } from "../types";

// US-BES-18 (FR-BES-26): the keeper's fixes to flagged rows go through the same judgment as the file, the server decides.
const MONSTERA = "11111111-1111-4111-8111-111111111111";
const FICUS = "22222222-2222-4222-8222-222222222222";
const PRIVATE = "55555555-5555-4555-8555-555555555555";
const UNKNOWN = "66666666-6666-4666-8666-666666666666";
// 2026-11-07 10:00 UTC: already the 7th in Berlin.
const NOW = new Date("2026-11-07T10:00:00Z");
const HEADER = "Art,Spitzname,Standort,Kaufdatum,Notizen";

const cand = (
  id: string,
  latinName: string,
  germanName: string | null,
  synonyms: string[] = [],
): SpeciesCandidate => ({ id, latinName, germanName, synonyms });

let specimens: InMemorySpecimens;
let locations: InMemoryLocations;

const deps = (): PreviewDependencies => ({
  specimens,
  locations,
  species: new InMemoryImportSpecies([
    { species: cand(MONSTERA, "Monstera deliciosa", "Fensterblatt") },
    { species: cand(FICUS, "Ficus lyrata", "Geigenfeige") },
    { species: cand(PRIVATE, "Hoya kerrii", "Herzblatt"), only: "ben" },
  ]),
  keeperOff: async () => false,
  clock: () => NOW,
});

/** The operation as the API runs a read: the schema checks the input, `run` answers (a refusal is returned, not thrown). */
async function previewWith(csv: string, overrides: unknown, markers: unknown = []) {
  const op = specimenImportPreview(deps());
  const input = op.schema({ csv, timeZone: "Europe/Berlin", markers, overrides });
  if (!input.ok) return input;
  return op.run({ userId: "anna" }, input.value);
}

async function previewOf(csv: string, overrides: unknown, markers?: unknown) {
  const r = await previewWith(csv, overrides, markers);
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r.value;
}

beforeEach(() => {
  specimens = new InMemorySpecimens({ anna: [] });
  locations = new InMemoryLocations();
});

describe("US-BES-18 a chosen species replaces the name match of its row", () => {
  it("US-BES-18 a chosen candidate makes a partial name ready and names the specimen", async () => {
    const csv = [HEADER, "Monstera,Lulu,,,"].join("\n");
    expect((await previewOf(csv, [])).rows[0]).toMatchObject({
      state: "flagged",
      species: { id: null },
    });
    const fixed = await previewOf(csv, [{ line: 2, speciesId: MONSTERA }]);
    expect(fixed.rows[0]).toMatchObject({
      state: "ready",
      species: { id: MONSTERA },
      specimenName: "Fensterblatt – Lulu",
    });
    expect(fixed.rows[0]?.reasons).toEqual([]);
  });

  it("US-BES-18 a species the account cannot see, or an unknown one, stays flagged as not found, never ready (P-04)", async () => {
    const csv = [HEADER, "Hoya,,,,"].join("\n");
    for (const speciesId of [PRIVATE, UNKNOWN]) {
      const r = await previewOf(csv, [{ line: 2, speciesId }]);
      expect(r.rows[0]).toMatchObject({ state: "flagged", species: { id: null } });
      expect(r.rows[0]?.reasons).toEqual([{ code: "import.species_not_found", field: "species" }]);
    }
  });
});

describe("US-BES-18 a marker fix replaces the nickname of its row", () => {
  it("US-BES-18 a marker fix clears marker_required on that row and the rest of the file is judged as before", async () => {
    // The third plant of the species has no marker: from the third plant on a marker is required (US-BES-03).
    const csv = [HEADER, "Ficus lyrata,Rot,,,", "Ficus lyrata,Blau,,,", "Ficus lyrata,,,,"].join(
      "\n",
    );
    const before = await previewOf(csv, []);
    expect(before.rows.map((r) => r.state)).toEqual(["ready", "ready", "flagged"]);
    expect(before.rows[2]?.reasons).toContainEqual({
      code: "specimen.marker_required",
      field: "nickname",
    });

    const fixed = await previewOf(csv, [{ line: 4, marker: "Gruen" }]);
    expect(fixed.rows[2]).toMatchObject({
      state: "ready",
      marker: "Gruen",
      specimenName: "Geigenfeige – Gruen",
    });
    expect(fixed.rows.map((r) => r.state)).toEqual(["ready", "ready", "ready"]);
  });

  it("US-BES-18 a marker fix replaces the nickname given in the file, and an empty marker means none", async () => {
    const csv = [HEADER, "Ficus lyrata,Rot,,,", "Ficus lyrata,Blau,,,", "Ficus lyrata,Alt,,,"].join(
      "\n",
    );
    const renamed = await previewOf(csv, [{ line: 4, marker: "Neu" }]);
    expect(renamed.rows[2]).toMatchObject({
      state: "ready",
      marker: "Neu",
      specimenName: "Geigenfeige – Neu",
    });
    const cleared = await previewOf(csv, [{ line: 4, marker: "" }]);
    expect(cleared.rows[2]).toMatchObject({ state: "flagged", marker: null });
    expect(cleared.rows[2]?.reasons).toContainEqual({
      code: "specimen.marker_required",
      field: "nickname",
    });
  });
});

describe("US-BES-18 a skipped row leaves the plan completely", () => {
  it("US-BES-18 a skipped row stops counting toward the three plants of its species and creates no location", async () => {
    // Row 4 is the third plant of the species: with it, the row without a marker (row 2) needs one; skipped, the two left
    // are two plants and row 2 needs none.
    const csv = [
      HEADER,
      "Ficus lyrata,,,,",
      "Ficus lyrata,Rot,,,",
      "Ficus lyrata,Blau,Keller,,",
    ].join("\n");
    const before = await previewOf(csv, []);
    expect(before.rows.map((r) => r.state)).toEqual(["flagged", "ready", "ready"]);
    expect(before.newLocations).toEqual(["Keller"]);

    const after = await previewOf(csv, [{ line: 4, skip: true }]);
    expect(after.rows.map((r) => [r.line, r.state])).toEqual([
      [2, "ready"],
      [3, "ready"],
      [4, "skipped"],
    ]);
    expect(after.rows[2]).toMatchObject({ state: "skipped", reasons: [] });
    expect(after.counts).toEqual({ ready: 2, flagged: 0, alreadyThere: 0, skipped: 1 });
    expect(after.newLocations).toEqual([]);
  });
});

describe("US-BES-18 the fixes are checked before anything is read", () => {
  it("US-BES-18 an override for a line that is not in the file is refused as input.invalid", async () => {
    const csv = [HEADER, "Ficus lyrata,,,,"].join("\n");
    const r = await previewWith(csv, [{ line: 9, skip: true }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "input.invalid" });
  });

  it("US-BES-18 at most one fix per line, at most one per row of the file, and a UUID species", async () => {
    const schema = specimenImportPreview(deps()).schema;
    const base = { csv: HEADER, timeZone: "Europe/Berlin", markers: [] };
    expect(
      schema({
        ...base,
        overrides: [
          { line: 2, skip: true },
          { line: 2, marker: "x" },
        ],
      }).ok,
    ).toBe(false);
    expect(schema({ ...base, overrides: [{ line: 2, speciesId: "Ficus" }] }).ok).toBe(false);
    const many = Array.from({ length: IMPORT_LIMITS.rows + 1 }, (_, i) => ({
      line: i + 2,
      skip: true,
    }));
    expect(schema({ ...base, overrides: many }).ok).toBe(false);
    expect(schema({ ...base, overrides: [{ line: 2, skip: true }] }).ok).toBe(true);
  });
});
