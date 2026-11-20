import { describe, expect, it } from "vitest";
import { idField, ok, orNull, shape, textField, timeZoneField } from "../../../kernel";
import { InMemoryAiLog, InMemoryDrafts } from "../../test-helpers";
import type { CollectionReadSource, SpecimenItem } from "../types";
import { SPECIMEN_WRITES, writeInputSchema, type SpecimenWrite } from "./specimen-writes";
import { aiSpecimenWrite, type WriteRunner } from "./write-call";

const now = new Date("2026-11-02T08:00:00Z");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const blue: SpecimenItem = {
  id: uuid(101),
  name: "Echte Aloe – blau",
  speciesId: uuid(1),
  speciesName: "Echte Aloe",
  marker: "blau",
  status: "plant",
  location: "Regal 2",
  lightZone: null,
  lightZoneSource: null,
  caughtAt: "2026-01-01",
  archivedAt: null,
};

/** Account "anna" owns one specimen and one location; every other account owns nothing (P-04). */
const source: CollectionReadSource = {
  searchSpecies: async () => ({ species: [], more: false }),
  exactSpecies: async () => [],
  species: async (_u, id) => (id === uuid(1) ? {} : null),
  specimens: async (u) => (u === "anna" ? [blue] : []),
  specimen: async () => null,
  locations: async (u) =>
    u === "anna" ? [{ id: uuid(10), name: "Regal 2", kind: "indoor", lightZoneId: null }] : [],
  zones: async () => [],
  measurements: async () => null,
};

const createCheck = shape({
  speciesId: idField("speciesId"),
  timeZone: timeZoneField("timeZone"),
  locationId: orNull(idField("locationId")),
  notes: orNull(textField("notes", { min: 1, max: 100 })),
});

function setup() {
  const calls: unknown[] = [];
  const runner: WriteRunner = {
    name: "specimen.mark",
    schema: (input) => ok(input),
    run: async (_u, input) => {
      calls.push(input);
      return ok({ id: blue.id });
    },
  };
  const writes = Object.fromEntries(SPECIMEN_WRITES.map((w) => [w, runner])) as Record<
    SpecimenWrite,
    WriteRunner
  >;
  const deps = { source, writes, drafts: new InMemoryDrafts(), log: new InMemoryAiLog() };
  return { deps, calls };
}
const call = (input: unknown, rights: "drafts" | "write" = "write") => ({
  userId: "anna",
  connectionId: uuid(900),
  rights,
  now,
  input,
  key: "k1",
});

describe("US-KI-14 specimen writes in core", () => {
  it("FR-KI-17 the tool schema comes from the operation's check: references instead of ids, notes left out", () => {
    const json = writeInputSchema("create_specimen", createCheck) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(Object.keys(json["properties"])).toEqual([
      "species",
      "location",
      "lightZone",
      "timeZone",
    ]);
    expect(json["required"]).toEqual(["species", "timeZone"]);
    expect(json["properties"]["location"]["type"]).toEqual(["string", "null"]);
  });

  it("US-KI-14 with 'write' the operation runs with resolved ids and without fields the tool does not pass (FR-KI-22)", async () => {
    const { deps, calls } = setup();
    const r = await aiSpecimenWrite(
      deps,
      "set_specimen_marker",
      call({ specimen: "blau", marker: "rot", notes: "geheim" }),
    );
    expect(r.ok && r.value.mode).toBe("written");
    expect(calls).toEqual([{ specimenId: blue.id, marker: "rot" }]);
  });

  it("US-KI-14 with 'create drafts' a draft of the same content arises, nothing runs, the step-up is named", async () => {
    const { deps, calls } = setup();
    const r = await aiSpecimenWrite(
      deps,
      "set_specimen_location",
      call({ specimen: blue.id, location: "Regal 2" }, "drafts"),
    );
    expect(r.ok && r.value).toMatchObject({
      mode: "draft",
      stepUp: { right: "write", scope: "pflanzen:write" },
    });
    expect(calls).toEqual([]);
  });

  it("FR-KI-23 a specimen id of another account is specimen.not_found and the refusal is logged", async () => {
    const { deps, calls } = setup();
    const r = await aiSpecimenWrite(deps, "restore_specimen", call({ specimen: uuid(555) }));
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(calls).toEqual([]);
    expect((await deps.log.list("anna", 10))[0]?.effect).toBe("refused: specimen.not_found");
  });
});
