import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  specimenCreate,
  specimenArchive,
  specimenMark,
  specimenLoad,
  NO_TARGET_LOCATION,
} from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const OTHER_SPECIES = "22222222-2222-4222-8222-222222222222";
const PRIVATE = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-02T23:30:00Z");

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const species = new SpeciesStub([
  { species: testSpecies(SPECIES) },
  { species: testSpecies(OTHER_SPECIES, { germanName: "Aloe" }) },
  { species: testSpecies(PRIVATE, { germanName: "Geheim" }), only: "ben" },
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
const mark = (
  specimenId: string,
  marker: unknown,
  opt: { context?: { userId: string | null }; key?: string } = {},
) =>
  execute(
    specimenMark({ specimens, species }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { specimenId, marker },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );
const idOf = (name: string) => specimens.rows.find((z) => z.name === name)?.id ?? "";
const snapshot = () => specimens.rows.map((z) => ({ ...z }));

beforeEach(async () => {
  specimens = new InMemorySpecimens({ anna: [LOCATION] });
  idem = new InMemoryIdempotencyStore();
  await create({ locationId: LOCATION });
  await create({ marker: "Klammer" });
});

describe("US-BES-03 rename: give or change a marker", () => {
  it("gives the plain specimen a marker; the name follows the naming rule", async () => {
    const r = await mark(idOf("Bogenhanf"), "rot");
    expect(r.ok && r.value).toMatchObject({ name: "Bogenhanf – rot", marker: "rot" });
  });

  it("changes an existing marker", async () => {
    const r = await mark(idOf("Bogenhanf – Klammer"), "blau");
    expect(r.ok && r.value.name).toBe("Bogenhanf – blau");
  });

  it("renaming changes no references: id, species, location, status and date stay", async () => {
    const id = idOf("Bogenhanf");
    const before = await specimenLoad(specimens, "anna", id);
    await mark(id, "rot");
    const after = await specimenLoad(specimens, "anna", id);
    expect(after).toMatchObject({
      id,
      speciesId: SPECIES,
      locationId: LOCATION,
      status: "plant",
      caughtAt: before?.caughtAt,
    });
    expect(after?.name).toBe("Bogenhanf – rot");
  });

  it("the same marker again, or only in other case, is allowed for the specimen itself", async () => {
    const id = idOf("Bogenhanf – Klammer");
    expect((await mark(id, "klammer")).ok).toBe(true);
    expect(specimens.rows.find((z) => z.id === id)?.name).toBe("Bogenhanf – klammer");
  });

  it("the marker is trimmed", async () => {
    const r = await mark(idOf("Bogenhanf"), "  rot  ");
    expect(r.ok && r.value.marker).toBe("rot");
  });

  it("the same marker at another species is allowed", async () => {
    await create({ speciesId: OTHER_SPECIES });
    const r = await mark(idOf("Aloe"), "klammer");
    expect(r.ok && r.value.name).toBe("Aloe – klammer");
  });
});

describe("US-BES-03 rename: duplicate or empty is an error without change", () => {
  it.each([["   "], [""], [undefined], [42], ["x".repeat(41)]])(
    "invalid marker %j: input.invalid, nothing written (P-03)",
    async (marker) => {
      const before = snapshot();
      const writes = specimens.writes;
      const r = await mark(idOf("Bogenhanf"), marker);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(specimens.rows).toEqual(before);
      expect(specimens.writes).toBe(writes);
    },
  );

  it("a marker of another specimen of the species (case-insensitive) is rejected", async () => {
    const before = snapshot();
    const r = await mark(idOf("Bogenhanf"), "KLAMMER");
    expect(!r.ok && r.error.code).toBe("specimen.marker_taken");
    expect(specimens.rows).toEqual(before);
  });

  it("the marker of an archived specimen stays taken", async () => {
    await execute(
      specimenArchive({ specimens, clock: () => NOW }),
      { idempotency: idem },
      {
        context: anna,
        input: {
          specimenId: idOf("Bogenhanf – Klammer"),
          timeZone: "Europe/Berlin",
          reason: "abgegeben",
        },
        idempotencyKey: "archive",
      },
    );
    const r = await mark(idOf("Bogenhanf"), "Klammer");
    expect(!r.ok && r.error.code).toBe("specimen.marker_taken");
  });

  it("an archived specimen is not renamed (its name stays, US-BES-07)", async () => {
    const id = idOf("Bogenhanf – Klammer");
    await execute(
      specimenArchive({ specimens, clock: () => NOW }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: id, timeZone: "Europe/Berlin", reason: "abgegeben" },
        idempotencyKey: "archive",
      },
    );
    const before = snapshot();
    const r = await mark(id, "blau");
    expect(!r.ok && r.error.code).toBe("specimen.archived");
    expect(specimens.rows).toEqual(before);
  });

  it("a species the account may not see: species.not_found, nothing written", async () => {
    // Anna's specimen of a species that is private to Ben (e.g. after a proposal was withdrawn): name unknowable.
    const row = await specimens.create("anna", {
      speciesId: PRIVATE,
      name: "Geheim",
      marker: null,
      locationId: null,
      caughtAt: "2026-10-03",
    });
    const before = snapshot();
    const r = await mark(typeof row === "object" ? row.id : "", "x");
    expect(!r.ok && r.error.code).toBe("species.not_found");
    expect(specimens.rows).toEqual(before);
  });
});

describe("US-BES-03 rename: accounts, idempotency, sign-in", () => {
  it("a specimen of another account looks like an unknown one and stays unchanged (P-04)", async () => {
    await create({}, ben);
    const foreign = specimens.rows.find((z) => z.userId === "ben")?.id ?? "";
    const before = snapshot();
    const r = await mark(foreign, "rot");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(specimens.rows).toEqual(before);
  });

  it("two accounts may use the same marker for the same species", async () => {
    await create({}, ben);
    await create({ marker: "rot" }, ben);
    const r = await mark(idOf("Bogenhanf"), "rot");
    expect(r.ok && r.value.name).toBe("Bogenhanf – rot");
  });

  it("an unknown specimen: specimen.not_found", async () => {
    const r = await mark("99999999-9999-4999-8999-999999999999", "rot");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
  });

  it("the same Idempotency-Key renames once and returns the same result", async () => {
    const id = idOf("Bogenhanf");
    const first = await mark(id, "rot", { key: "same" });
    const writes = specimens.writes;
    expect(await mark(id, "rot", { key: "same" })).toEqual(first);
    expect(specimens.writes).toBe(writes);
  });

  it("without sign-in: access.not_signed_in, nothing written", async () => {
    const writes = specimens.writes;
    const r = await mark(idOf("Bogenhanf"), "rot", { context: { userId: null } });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    expect(specimens.writes).toBe(writes);
  });
});
