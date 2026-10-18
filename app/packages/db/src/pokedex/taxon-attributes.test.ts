import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate, openOwnerPool } from "../kernel/index.ts";
import { TaxonAttributesPostgres, type AttributeFactRecord } from "./taxon-attributes.ts";

// US-ENT-09, DM-ENT-01, P-08: species attributes with source and license per field in real PostgreSQL (`make db-up`).
let pool: Pool;
let store: TaxonAttributesPostgres;
const SPECIES = "Zz attributus testus";
const evidence = {
  source: "wikipedia",
  url: "https://de.wikipedia.org/wiki/Test",
  license: "CC-BY-SA-4.0",
  retrievedAt: "2026-10-17",
} as const;
const fact = (
  field: AttributeFactRecord["field"],
  value: AttributeFactRecord["value"],
): AttributeFactRecord => ({
  species: SPECIES,
  field,
  value,
  evidence,
});

beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
  store = new TaxonAttributesPostgres(pool);
});
beforeEach(async () => {
  await pool.query("delete from taxon_attribute where latin_name = $1", [SPECIES]);
});
afterAll(async () => {
  await pool.query("delete from taxon_attribute where latin_name = $1", [SPECIES]);
  await pool.end();
});

describe("US-ENT-09 species attributes in the database", () => {
  it("US-ENT-09 stores each field with source, link, license and date and reads it back; other fields stay unknown", async () => {
    await store.save([
      fact("toxicToPets", true),
      fact("minTemperature", 12.5),
      fact("humidity", "high"),
    ]);
    const got = await store.forSpecies([SPECIES, "Unknown species"]);
    expect(got.map((f) => [f.field, f.value])).toEqual([
      ["humidity", "high"],
      ["minTemperature", 12.5],
      ["toxicToPets", true],
    ]);
    expect(got[0]?.evidence).toEqual(evidence);
    expect(got.some((f) => f.field === "growthSize")).toBe(false);
    expect(await store.forSpecies([])).toEqual([]);
  });

  it("US-ENT-09 names the species that already have a fact for the field", async () => {
    await store.save([fact("growthSize", "small")]);
    expect(await store.speciesWith("growthSize")).toContain(SPECIES);
    expect(await store.speciesWith("humidity")).not.toContain(SPECIES);
  });

  it("US-ENT-09 a new research replaces the value of the field instead of adding a second row", async () => {
    await store.save([fact("humidity", "low")]);
    await store.save([
      { ...fact("humidity", "medium"), evidence: { ...evidence, source: "wikidata" } },
    ]);
    const got = await store.forSpecies([SPECIES]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ value: "medium", evidence: { source: "wikidata" } });
  });

  it("US-ENT-09 refuses a value without citable source, https link, free license or with a wrong type", async () => {
    const bad = (f: AttributeFactRecord) => expect(store.save([f])).rejects.toThrow();
    await bad({ ...fact("humidity", "low"), evidence: { ...evidence, source: "ai" as never } });
    await bad({ ...fact("humidity", "low"), evidence: { ...evidence, url: "http://example.org" } });
    await bad({ ...fact("humidity", "low"), evidence: { ...evidence, license: "" as never } });
    await bad(fact("humidity", "wet"));
    await bad(fact("toxicToPets", "yes"));
    await bad(fact("minTemperature", 99));
    expect(await store.forSpecies([SPECIES])).toEqual([]);
  });
});
