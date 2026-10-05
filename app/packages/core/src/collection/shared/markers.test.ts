import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenCreate, specimenArchive, NO_TARGET_LOCATION } from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "./test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const OTHER_SPECIES = "22222222-2222-4222-8222-222222222222";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-02T23:30:00Z");

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const species = new SpeciesStub([
  { species: testSpecies(SPECIES) },
  { species: testSpecies(OTHER_SPECIES, { germanName: "Aloe" }) },
]);

const create = (input: Record<string, unknown>, context: { userId: string } = anna) =>
  execute(
    specimenCreate({ specimens, species, targetLocation: NO_TARGET_LOCATION, clock: () => NOW }),
    { idempotency: idem },
    {
      context,
      input: { speciesId: SPECIES, timeZone: "Europe/Berlin", ...input },
      idempotencyKey: `k${++counter}`,
    },
  );
const archive = (specimenId: string) =>
  execute(
    specimenArchive({ specimens, clock: () => NOW }),
    { idempotency: idem },
    {
      context: anna,
      input: { specimenId, timeZone: "Europe/Berlin", reason: "abgegeben" },
      idempotencyKey: `k${++counter}`,
    },
  );
const names = () => specimens.rows.filter((z) => z.userId === "anna").map((z) => z.name);
const idOf = (name: string) => specimens.rows.find((z) => z.name === name)?.id ?? "";

beforeEach(() => {
  specimens = new InMemorySpecimens();
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-03 naming rule DM-BES-03: first and second specimen", () => {
  it("the 1st specimen: name = species, no marker", async () => {
    const r = await create({});
    expect(r.ok && r.value).toMatchObject({ name: "Bogenhanf", marker: null });
  });

  it("the 2nd specimen gets a marker; the first keeps its plain name", async () => {
    await create({});
    const r = await create({ marker: "Klammer" });
    expect(r.ok && r.value).toMatchObject({ name: "Bogenhanf – Klammer", marker: "Klammer" });
    expect(names()).toEqual(["Bogenhanf", "Bogenhanf – Klammer"]);
  });

  it("the 2nd specimen without a marker is an error without change, even if the plain name is free", async () => {
    await create({ marker: "rot" });
    const before = specimens.rows.map((z) => ({ ...z }));
    const r = await create({});
    expect(!r.ok && r.error.code).toBe("specimen.marker_required");
    expect(specimens.rows).toEqual(before);
  });

  it("a duplicate marker of the species (case-insensitive) is an error without change", async () => {
    await create({});
    await create({ marker: "Klammer" });
    const before = specimens.rows.map((z) => ({ ...z }));
    const r = await create({ marker: "KLAMMER" });
    expect(!r.ok && r.error.code).toBe("specimen.marker_taken");
    expect(specimens.rows).toEqual(before);
  });

  it("the same marker at another species is fine", async () => {
    await create({ marker: "rot" });
    const r = await create({ speciesId: OTHER_SPECIES, marker: "rot" });
    expect(r.ok && r.value.name).toBe("Aloe – rot");
  });
});

describe("US-BES-03 from the 3rd specimen on every specimen has its own marker", () => {
  beforeEach(async () => {
    await create({});
    await create({ marker: "Klammer" });
  });

  it("asks for the missing marker of the plain specimen before saving, and writes nothing", async () => {
    const before = specimens.rows.map((z) => ({ ...z }));
    const writes = specimens.writes;
    const r = await create({ marker: "rot" });
    expect(!r.ok && r.error.code).toBe("specimen.markers_missing");
    expect(!r.ok && r.error.data).toMatchObject({
      missing: [{ id: idOf("Bogenhanf"), name: "Bogenhanf" }],
    });
    expect(specimens.rows).toEqual(before);
    expect(specimens.writes).toBe(writes);
  });

  it("with the missing marker all three are saved together; ids stay, the old names change", async () => {
    const first = idOf("Bogenhanf");
    const r = await create({ marker: "rot", markers: [{ specimenId: first, marker: "blau" }] });
    expect(r.ok && r.value.name).toBe("Bogenhanf – rot");
    expect(names()).toEqual(["Bogenhanf – blau", "Bogenhanf – Klammer", "Bogenhanf – rot"]);
    expect(idOf("Bogenhanf – blau")).toBe(first);
  });

  it("a 3rd specimen without its own marker is rejected and the plain one is not renamed", async () => {
    const r = await create({ markers: [{ specimenId: idOf("Bogenhanf"), marker: "blau" }] });
    expect(!r.ok && r.error.code).toBe("specimen.marker_required");
    expect(names()).toEqual(["Bogenhanf", "Bogenhanf – Klammer"]);
  });

  it("empty, duplicate or colliding markers in the answer: error, nothing changes", async () => {
    const first = idOf("Bogenhanf");
    const before = specimens.rows.map((z) => ({ ...z }));
    const cases: [string, Record<string, unknown>, string][] = [
      ["empty", { marker: "rot", markers: [{ specimenId: first, marker: "  " }] }, "input.invalid"],
      [
        "same as the new one",
        { marker: "rot", markers: [{ specimenId: first, marker: "ROT" }] },
        "specimen.marker_taken",
      ],
      [
        "same as an existing one",
        { marker: "rot", markers: [{ specimenId: first, marker: "klammer" }] },
        "specimen.marker_taken",
      ],
    ];
    for (const [, input, code] of cases) {
      const r = await create(input);
      expect(!r.ok && r.error.code).toBe(code);
      expect(specimens.rows).toEqual(before);
    }
  });

  it("an answer for a specimen that is not missing a marker is rejected", async () => {
    const marked = idOf("Bogenhanf – Klammer");
    const r = await create({ marker: "rot", markers: [{ specimenId: marked, marker: "x" }] });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(names()).toEqual(["Bogenhanf", "Bogenhanf – Klammer"]);
  });

  it("two accounts: a specimen of another account cannot receive a marker", async () => {
    await create({}, ben);
    const foreign = specimens.rows.find((z) => z.userId === "ben")?.id ?? "";
    const r = await create({ marker: "rot", markers: [{ specimenId: foreign, marker: "x" }] });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(specimens.rows.find((z) => z.id === foreign)?.name).toBe("Bogenhanf");
  });

  it("when nothing is missing no answer is needed", async () => {
    await create({ marker: "rot", markers: [{ specimenId: idOf("Bogenhanf"), marker: "blau" }] });
    const r = await create({ marker: "grün" });
    expect(r.ok && r.value.name).toBe("Bogenhanf – grün");
  });
});

describe("US-BES-03 archived specimens do not count and keep their name (US-BES-07)", () => {
  it("an archived specimen is not asked for a marker and stays untouched", async () => {
    await create({});
    await create({ marker: "Klammer" });
    await archive(idOf("Bogenhanf"));
    const r = await create({ marker: "rot" });
    expect(r.ok && r.value.name).toBe("Bogenhanf – rot");
    expect(names()).toEqual(["Bogenhanf", "Bogenhanf – Klammer", "Bogenhanf – rot"]);
  });

  it("the name of an archived specimen stays taken", async () => {
    await create({});
    await archive(idOf("Bogenhanf"));
    const r = await create({});
    expect(!r.ok && r.error.code).toBe("specimen.name_taken");
  });

  it("the marker of an archived specimen stays taken", async () => {
    await create({ marker: "rot" });
    await archive(idOf("Bogenhanf – rot"));
    const r = await create({ marker: "ROT" });
    expect(!r.ok && r.error.code).toBe("specimen.marker_taken");
  });
});
