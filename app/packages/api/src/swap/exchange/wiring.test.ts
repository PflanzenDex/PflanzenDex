import { describe, expect, it } from "vitest";
import type { SpeciesPostgres } from "@pflanzendex/db";
import { speciesOncePer } from "./wiring";

// NFR-12 US-SOZ-09: one species read per owner within a request; an owner's entries never answer for another owner (P-05).
type Row = { readonly id: string; readonly latinName: string } | null;

/** A species store that knows which IDs each owner can see, and records every read it is asked for. */
function storeWith(visible: Readonly<Record<string, readonly string[]>>) {
  const reads: { owner: string; ids: readonly string[] }[] = [];
  const findMany = async (owner: string, ids: readonly string[]): Promise<readonly Row[]> => {
    reads.push({ owner, ids: [...ids] });
    return ids.map((id) =>
      (visible[owner] ?? []).includes(id) ? { id, latinName: `${owner} ${id}` } : null,
    );
  };
  return { reads, species: { findMany } as unknown as Pick<SpeciesPostgres, "findMany"> };
}

describe("US-SOZ-09 NFR-12 the species of an owner are read once per request", () => {
  it("NFR-12 US-SOZ-09 a later reader of the same owner asks only for the IDs not read yet", async () => {
    const { reads, species } = storeWith({ anna: ["a", "b", "c"] });
    const read = speciesOncePer(species);
    const first = await read("anna", ["a", "b"]);
    const second = await read("anna", ["b", "c", "a"]);
    expect(reads).toEqual([
      { owner: "anna", ids: ["a", "b"] },
      { owner: "anna", ids: ["c"] },
    ]);
    expect(first.map((s) => s?.id)).toEqual(["a", "b"]);
    expect(second.map((s) => s?.id)).toEqual(["b", "c", "a"]);
  });

  it("NFR-12 US-SOZ-09 an ID asked again while its read is in flight is read once", async () => {
    const { reads, species } = storeWith({ anna: ["a", "b", "c"] });
    const read = speciesOncePer(species);
    const [x, y] = await Promise.all([read("anna", ["a", "b"]), read("anna", ["b", "c"])]);
    expect(reads).toEqual([
      { owner: "anna", ids: ["a", "b"] },
      { owner: "anna", ids: ["c"] },
    ]);
    expect(x.map((s) => s?.id)).toEqual(["a", "b"]);
    expect(y.map((s) => s?.id)).toEqual(["b", "c"]);
  });

  it("NFR-12 US-SOZ-09 P-05 an owner's read never answers for another owner, and a species the other cannot see stays unknown", async () => {
    const { reads, species } = storeWith({ anna: ["a"], ben: [] });
    const read = speciesOncePer(species);
    expect((await read("anna", ["a"]))[0]?.id).toBe("a");
    expect(await read("ben", ["a"])).toEqual([null]);
    expect(reads).toEqual([
      { owner: "anna", ids: ["a"] },
      { owner: "ben", ids: ["a"] },
    ]);
  });

  it("NFR-12 US-SOZ-09 nothing is read for no ID, and a mixed-case ID finds the read of its lower-case form", async () => {
    const { reads, species } = storeWith({ anna: ["a"] });
    const read = speciesOncePer(species);
    expect(await read("anna", [])).toEqual([]);
    await read("anna", ["A"]);
    await read("anna", ["a"]);
    expect(reads).toEqual([{ owner: "anna", ids: ["a"] }]);
  });
});
