import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryImportSpecies,
  InMemoryLocations,
  InMemorySpecimens,
} from "../../shared/test-helpers";
import { specimenImportPreview, type PreviewDependencies } from "./preview";
import type { SpeciesCandidate } from "../types";

// US-BES-18 (FR-BES-26): the preview reads the file, answers every row and writes nothing.
const MONSTERA = "11111111-1111-4111-8111-111111111111";
const FICUS = "22222222-2222-4222-8222-222222222222";
const DRACAENA = "33333333-3333-4333-8333-333333333333";
const PRIVATE = "55555555-5555-4555-8555-555555555555";
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
let off: boolean;

const deps = (): PreviewDependencies => ({
  specimens,
  locations,
  species: new InMemoryImportSpecies([
    { species: cand(MONSTERA, "Monstera deliciosa", "Fensterblatt", ["Philodendron pertusum"]) },
    { species: cand(FICUS, "Ficus lyrata", "Geigenfeige") },
    { species: cand(DRACAENA, "Dracaena trifasciata", "Bogenhanf") },
    { species: cand(PRIVATE, "Hoya kerrii", "Herzblatt"), only: "ben" },
  ]),
  keeperOff: async () => off,
  clock: () => NOW,
});

/** The operation as the API runs a read: its schema checks the input, `run` answers. */
async function preview(csv: string, opt: { user?: string; markers?: unknown } = {}) {
  const op = specimenImportPreview(deps());
  const input = op.schema({ csv, timeZone: "Europe/Berlin", markers: opt.markers ?? [] });
  if (!input.ok) throw new Error(`input: ${input.error.code}`);
  return op.run({ userId: opt.user ?? "anna" }, input.value);
}

async function previewRows(csv: string, opt: { user?: string; markers?: unknown } = {}) {
  const r = await preview(csv, opt);
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r.value;
}

const plant = (speciesId: string, name: string, marker: string | null) => ({
  speciesId,
  name,
  marker,
  locationId: null,
  lightZoneId: null,
  caughtAt: "2026-10-01",
  status: "plant" as const,
});

beforeEach(() => {
  specimens = new InMemorySpecimens({ anna: [] });
  locations = new InMemoryLocations();
  off = false;
});

describe("US-BES-18 CSV preview: every row is ready, flagged or already there", () => {
  it("US-BES-18 each row says what it would write and why it is flagged, in file order", async () => {
    const r = await previewRows(
      [
        HEADER,
        "Monstera deliciosa,Lulu,Fenster,2026-03-01,ok",
        "Monstera,,,,",
        "Kaktusxyz,,,,",
        ",,,,nur eine Notiz",
        "Bogenhanf,,,,",
      ].join("\n"),
    );
    expect(r.rows.map((x) => [x.line, x.state])).toEqual([
      [2, "ready"],
      [3, "flagged"],
      [4, "flagged"],
      [5, "flagged"],
      // "Bogenhanf" is the German name of the one Dracaena of the fixture: an exact name, so ready.
      [6, "ready"],
    ]);
    expect(r.rows[0]).toMatchObject({
      species: { id: MONSTERA, name: "Monstera deliciosa" },
      marker: "Lulu",
      specimenName: "Fensterblatt – Lulu",
      catchDate: "2026-03-01",
      notes: "ok",
      reasons: [],
    });
    expect(r.rows[1]?.reasons).toEqual([{ code: "import.species_candidates", field: "species" }]);
    expect(r.rows[1]?.species.candidates.map((c) => c.id)).toEqual([MONSTERA]);
    expect(r.rows[2]?.reasons).toEqual([{ code: "import.species_not_found", field: "species" }]);
    expect(r.rows[3]?.reasons).toEqual([{ code: "import.species_missing", field: "species" }]);
    expect(r.rows[4]?.reasons).toEqual([]);
    expect(r.counts).toEqual({ ready: 2, flagged: 3, alreadyThere: 0 });
  });

  it("US-BES-18 a flagged row names the field and the reason: impossible, future and early dates, long texts", async () => {
    const r = await previewRows(
      [
        HEADER,
        "Monstera deliciosa,,,31.02.2026,",
        "Monstera deliciosa,,,2026-11-08,",
        "Monstera deliciosa,,,1899-12-31,",
        `Monstera deliciosa,${"x".repeat(41)},,,`,
        `Monstera deliciosa,,${"z".repeat(61)},,`,
        `Monstera deliciosa,,,,${"y".repeat(2001)}`,
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.reasons.map((y) => [y.code, y.field]))).toEqual([
      [["input.invalid", "purchaseDate"]],
      [["specimen.caught_in_future", "purchaseDate"]],
      [["input.invalid", "purchaseDate"]],
      [["input.invalid", "nickname"]],
      [["input.invalid", "location"]],
      [["input.invalid", "notes"]],
    ]);
  });

  it("US-BES-18 a date of today is allowed; an empty date means today on creation (FR-BES-04)", async () => {
    const r = await previewRows(
      [HEADER, "Monstera deliciosa,,,2026-11-07,", "Ficus lyrata,,,,"].join("\n"),
    );
    expect(r.rows.map((x) => x.catchDate)).toEqual(["2026-11-07", null]);
    expect(r.rows.map((x) => x.state)).toEqual(["ready", "ready"]);
  });

  it("US-BES-18 a German date and an ISO date name the same day", async () => {
    const r = await previewRows(
      [HEADER, "Monstera deliciosa,,,07.11.2026,", "Ficus lyrata,,,2026-11-07,"].join("\n"),
    );
    expect(r.rows.map((x) => x.catchDate)).toEqual(["2026-11-07", "2026-11-07"]);
  });
});

describe("US-BES-18 locations of the rows: known, new or none", () => {
  it("US-BES-18 a known location is matched by its name, a new one is said to be new and listed once", async () => {
    await locations.create("anna", { name: "Fenster", kind: "indoor", lightZoneId: null });
    const r = await previewRows(
      [
        HEADER,
        "Monstera deliciosa,A,fenster,,",
        "Ficus lyrata,B,Balkon,,",
        "Dracaena trifasciata,C,Balkon,,",
        "Ficus lyrata,D,,,",
      ].join("\n"),
    );
    expect(r.rows[0]?.location).toMatchObject({ name: "Fenster", isNew: false });
    expect(r.rows[0]?.location?.id).toEqual(locations.rows[0]?.id);
    expect(r.rows[1]?.location).toMatchObject({ name: "Balkon", isNew: true, id: null });
    expect(r.rows[3]?.location).toBeNull();
    expect(r.newLocations).toEqual(["Balkon"]);
  });

  it("US-BES-18 another keeper's location is not matched (P-04): it is a new location here", async () => {
    await locations.create("ben", { name: "Garten", kind: "outdoor", lightZoneId: null });
    const r = await previewRows([HEADER, "Monstera deliciosa,,Garten,,"].join("\n"));
    expect(r.rows[0]?.location).toMatchObject({ name: "Garten", isNew: true });
  });

  it("US-BES-18 the preview writes nothing: no specimen and no location is created", async () => {
    await previewRows(
      [HEADER, "Monstera deliciosa,A,Balkon,2026-03-01,x", "Ficus lyrata,,Garten,,"].join("\n"),
    );
    expect(specimens.writes).toBe(0);
    expect(locations.rows).toHaveLength(0);
  });
});

describe("US-BES-18 already there and duplicates in the file", () => {
  it("US-BES-18 a row whose specimen name exists is already there, archived ones included", async () => {
    await specimens.create("anna", plant(MONSTERA, "Fensterblatt – Lulu", "Lulu"));
    const archived = await specimens.create("anna", plant(MONSTERA, "Fensterblatt – Alt", "Alt"));
    if (typeof archived === "object")
      await specimens.archive("anna", archived.id, "eingegangen", "2026-10-02");
    const r = await previewRows(
      [HEADER, "Monstera deliciosa,Lulu,,,", "Monstera deliciosa,alt,,,"].join("\n"),
    );
    expect(r.rows.map((x) => x.state)).toEqual(["already_there", "already_there"]);
    expect(r.rows[0]?.reasons).toEqual([{ code: "specimen.name_taken", field: "species" }]);
    expect(r.counts).toEqual({ ready: 0, flagged: 0, alreadyThere: 2 });
  });

  it("US-BES-18 a later row with the same species and marker repeats an earlier one and is flagged", async () => {
    const r = await previewRows([HEADER, "Ficus lyrata,,,,", "Ficus lyrata,,,,"].join("\n"));
    expect(r.rows.map((x) => x.state)).toEqual(["ready", "flagged"]);
    expect(r.rows[1]?.reasons).toEqual([{ code: "import.duplicate_row", field: "nickname" }]);
  });

  it("US-BES-18 the same marker in another case repeats too; the same marker for another species does not", async () => {
    const r = await previewRows(
      [
        HEADER,
        "Monstera deliciosa,Lulu,,,",
        "Monstera deliciosa,lulu,,,",
        "Ficus lyrata,Lulu,,,",
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.state)).toEqual(["ready", "flagged", "ready"]);
  });
});

describe("US-BES-18 markers of the import (US-BES-03)", () => {
  it("US-BES-18 an existing unmarked plant is asked for a marker when the file makes the third one", async () => {
    await specimens.create("anna", plant(DRACAENA, "Bogenhanf", null));
    const csv = [HEADER, "Dracaena trifasciata,a,,,", "Dracaena trifasciata,b,,,"].join("\n");
    const asked = await previewRows(csv);
    expect(asked.rows.map((x) => x.state)).toEqual(["ready", "flagged"]);
    expect(asked.rows[1]?.reasons[0]).toMatchObject({ code: "specimen.markers_missing" });
    expect(asked.markers).toHaveLength(1);
    expect(asked.markers[0]).toMatchObject({ speciesId: DRACAENA, speciesName: "Bogenhanf" });
    const id = asked.markers[0]?.missing[0]?.id ?? "";
    const answered = await previewRows(csv, { markers: [{ specimenId: id, marker: "c" }] });
    expect(answered.rows.map((x) => x.state)).toEqual(["ready", "ready"]);
    expect(answered.markers).toEqual([]);
  });

  it("US-BES-18 an answer for a specimen the file does not ask for is refused (specimen.not_found)", async () => {
    await specimens.create("anna", plant(DRACAENA, "Bogenhanf", null));
    const r = await preview([HEADER, "Ficus lyrata,,,,"].join("\n"), {
      markers: [{ specimenId: "99999999-9999-4999-8999-999999999999", marker: "c" }],
    });
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
  });

  it("US-BES-18 a plant without a marker is flagged once the account has three active plants of its species", async () => {
    await specimens.create("anna", plant(DRACAENA, "Bogenhanf – e1", "e1"));
    await specimens.create("anna", plant(DRACAENA, "Bogenhanf – e2", "e2"));
    const r = await previewRows([HEADER, "Dracaena trifasciata,,,,"].join("\n"));
    expect(r.rows.map((x) => x.state)).toEqual(["flagged"]);
    expect(r.rows[0]?.reasons).toEqual([{ code: "specimen.marker_required", field: "nickname" }]);
  });

  it("US-BES-18 rows of one species without a marker repeat each other: the second and third are flagged", async () => {
    const r = await previewRows(
      [
        HEADER,
        "Dracaena trifasciata,,,,",
        "Dracaena trifasciata,,,,",
        "Dracaena trifasciata,,,,",
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.state)).toEqual(["ready", "flagged", "flagged"]);
    expect(r.rows[1]?.reasons).toEqual([{ code: "import.duplicate_row", field: "nickname" }]);
  });
});

describe("US-BES-18 the keeper switch and the file's own refusals", () => {
  it("US-BES-18 while the switch is off the preview is refused as onboarding.keeper_off (P-12)", async () => {
    off = true;
    const r = await preview([HEADER, "Monstera deliciosa,,,,"].join("\n"));
    expect(r).toMatchObject({ ok: false, error: { code: "onboarding.keeper_off" } });
  });

  it("US-BES-18 a file that is not readable is refused as a whole (FR-BES-26)", async () => {
    expect(await preview("Spitzname\nLulu")).toMatchObject({
      ok: false,
      error: { code: "import.no_species_column" },
    });
    expect(await preview("")).toMatchObject({
      ok: false,
      error: { code: "import.file_unreadable" },
    });
  });

  it("US-BES-18 a species the account does not see is no match (P-04): another keeper's private proposal", async () => {
    const r = await previewRows([HEADER, "Hoya kerrii,,,,"].join("\n"));
    expect(r.rows[0]?.reasons).toEqual([{ code: "import.species_not_found", field: "species" }]);
    const own = await previewRows([HEADER, "Hoya kerrii,,,,"].join("\n"), { user: "ben" });
    expect(own.rows[0]?.state).toBe("ready");
  });

  it("US-BES-18 the specimen name follows the naming rule with the species' German name (DM-BES-03)", async () => {
    const r = await previewRows([HEADER, "Ficus lyrata,Pit,,,"].join("\n"));
    expect(r.rows[0]?.specimenName).toBe("Geigenfeige – Pit");
  });
});
