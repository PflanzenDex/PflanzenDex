import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  specimenCreate,
  specimenLoad,
  specimenList,
  specimenNotes,
  specimenSetNotes,
  NO_TARGET_LOCATION,
  SPECIMEN_LIMITS,
} from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-02T23:30:00Z");

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const species = new SpeciesStub([{ species: testSpecies(SPECIES) }]);

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

const setNotes = (
  specimenId: string,
  notes: unknown,
  opt: { context?: { userId: string | null } } = {},
) =>
  execute(
    specimenSetNotes({ specimens }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { specimenId, notes },
      idempotencyKey: `k${++counter}`,
    },
  );

const idOf = (name: string) => specimens.rows.find((z) => z.name === name)?.id ?? "";
const notesOf = (name: string) => specimens.notesOf(idOf(name));

beforeEach(async () => {
  specimens = new InMemorySpecimens({ anna: [] });
  idem = new InMemoryIdempotencyStore();
  await create({ marker: null, notes: null });
});

describe("US-BES-18 the notes field: set, trim and clear", () => {
  it("the limit is 2000 characters (starting value, assumption)", () => {
    expect(SPECIMEN_LIMITS.notes.max).toBe(2000);
  });

  it("the text is trimmed and the answer names the specimen and its notes", async () => {
    const id = idOf("Bogenhanf");
    const r = await setNotes(id, "  Nur morgens gießen.  ");
    expect(r.ok && r.value).toEqual({ id, notes: "Nur morgens gießen." });
    expect(notesOf("Bogenhanf")).toBe("Nur morgens gießen.");
  });

  it("a second change replaces the text", async () => {
    const id = idOf("Bogenhanf");
    await setNotes(id, "Erste Notiz");
    await setNotes(id, "Zweite Notiz");
    expect(notesOf("Bogenhanf")).toBe("Zweite Notiz");
  });

  it.each([[""], ["   "], ["\n\t"], [null]])(
    "an empty text %j clears the notes (null, none)",
    async (empty) => {
      const id = idOf("Bogenhanf");
      await setNotes(id, "Etwas");
      const r = await setNotes(id, empty);
      expect(r.ok && r.value).toEqual({ id, notes: null });
      expect(notesOf("Bogenhanf")).toBeNull();
    },
  );

  it("exactly 2000 characters are kept", async () => {
    const id = idOf("Bogenhanf");
    const text = "x".repeat(2000);
    const r = await setNotes(id, text);
    expect(r.ok && r.value.notes).toBe(text);
  });

  it("characters are counted as the database counts them: 2000 emoji are kept, 2001 are refused", async () => {
    const id = idOf("Bogenhanf");
    expect((await setNotes(id, "🌿".repeat(2000))).ok).toBe(true);
    const before = notesOf("Bogenhanf");
    const writes = specimens.writes;
    const r = await setNotes(id, "🌿".repeat(2001));
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(notesOf("Bogenhanf")).toBe(before);
    expect(specimens.writes).toBe(writes);
  });

  it("over the limit: input.invalid on the field notes, nothing is written (P-03)", async () => {
    await setNotes(idOf("Bogenhanf"), "Alt");
    const before = specimens.rows.map((z) => ({ ...z }));
    const writes = specimens.writes;
    const r = await setNotes(idOf("Bogenhanf"), "x".repeat(2001));
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details).toEqual([{ field: "notes", code: "input.invalid" }]);
    expect(specimens.rows).toEqual(before);
    expect(specimens.writes).toBe(writes);
  });

  it.each([[undefined], [42], [{ text: "x" }]])(
    "a value that is not text (%j) is refused and nothing is written",
    async (value) => {
      const before = specimens.rows.map((z) => ({ ...z }));
      const r = await setNotes(idOf("Bogenhanf"), value);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(specimens.rows).toEqual(before);
    },
  );
});

describe("US-BES-18 the notes belong to one account (P-04, P-05)", () => {
  it("a foreign specimen answers specimen.not_found and nothing changes", async () => {
    const id = idOf("Bogenhanf");
    await setNotes(id, "Geheim");
    const before = specimens.rows.map((z) => ({ ...z }));
    const r = await setNotes(id, "Ben war hier", { context: ben });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(specimens.rows).toEqual(before);
    expect(notesOf("Bogenhanf")).toBe("Geheim");
  });

  it("an unknown specimen answers specimen.not_found", async () => {
    const r = await setNotes("99999999-9999-4999-8999-999999999999", "Notiz");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
  });

  it("an archived specimen is not changed: specimen.archived, nothing is written (US-BES-07)", async () => {
    const id = idOf("Bogenhanf");
    await setNotes(id, "Vor dem Archiv");
    await specimens.archive("anna", id, "eingegangen", "2026-10-02");
    const writes = specimens.writes;
    const r = await setNotes(id, "Nach dem Archiv");
    expect(!r.ok && r.error.code).toBe("specimen.archived");
    expect(notesOf("Bogenhanf")).toBe("Vor dem Archiv");
    expect(specimens.writes).toBe(writes);
  });

  it("the notes are not part of the specimen read or the list (they leave the account only through the keeper's own detail)", async () => {
    const id = idOf("Bogenhanf");
    await setNotes(id, "Nur für mich");
    const loaded = await specimenLoad(specimens, "anna", id);
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty("notes");
    const listed = await specimenList(specimens, "anna");
    expect(listed.every((z) => !("notes" in z))).toBe(true);
  });
});

describe("US-BES-18 the keeper reads the notes of an own specimen", () => {
  it("specimenNotes returns the notes of the own specimen, null for a foreign or unknown one", async () => {
    const id = idOf("Bogenhanf");
    await setNotes(id, "Standort wechseln");
    expect(await specimenNotes(specimens, "anna", id)).toEqual({
      id,
      notes: "Standort wechseln",
    });
    expect(await specimenNotes(specimens, "ben", id)).toBeNull();
    expect(
      await specimenNotes(specimens, "anna", "99999999-9999-4999-8999-999999999999"),
    ).toBeNull();
  });
});

describe("US-BES-18 notes at creation (the import will need them)", () => {
  it("create takes notes and stores the trimmed text", async () => {
    const r = await create({ marker: "rot", notes: "  Vom Nachbarn bekommen. " });
    expect(r.ok).toBe(true);
    expect(notesOf("Bogenhanf – rot")).toBe("Vom Nachbarn bekommen.");
  });

  it("create without notes, or with an empty text, stores none", async () => {
    await create({ marker: "blau" });
    await create({ marker: "grün", notes: "   " });
    expect(notesOf("Bogenhanf – blau")).toBeNull();
    expect(notesOf("Bogenhanf – grün")).toBeNull();
  });

  it("create with notes over the limit is refused and nothing is written", async () => {
    const writes = specimens.writes;
    const r = await create({ marker: "lila", notes: "x".repeat(2001) });
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(specimens.rows.some((z) => z.name === "Bogenhanf – lila")).toBe(false);
    expect(specimens.writes).toBe(writes);
  });

  it("the create answer does not carry the notes (the list and the card read leave them out)", async () => {
    const r = await create({ marker: "gelb", notes: "Nur für mich" });
    expect(r.ok && r.value).not.toHaveProperty("notes");
  });
});
