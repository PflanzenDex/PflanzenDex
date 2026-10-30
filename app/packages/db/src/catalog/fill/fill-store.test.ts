import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { assignRole } from "../../fixtures.ts";
import { findSchemaViolations } from "../../schema-check.ts";
import {
  CatalogFillPostgres,
  CatalogGapsPostgres,
  CatalogLoadPostgres,
  ReviewPostgres,
  SpeciesPostgres,
} from "../index.ts";
import type { FieldValueRecord, SnapshotRecord } from "./fill-store.ts";
import type { LoadRecord } from "./catalog-load.ts";
import type { SpeciesName, SpeciesValues } from "../species.ts";

// US-BES-12, DM-BES-05, DM-BES-06, FR-BES-12, FR-BES-19: the database side of the catalog fill (`make db-up`).
let owner: Pool;
let admin: Pool;
let store: CatalogFillPostgres;
let species: SpeciesPostgres;
const [anna, operator] = [randomUUID(), randomUUID()];
const run = randomUUID().slice(0, 8);

const values = (latinName: string, extra: Partial<SpeciesValues> = {}): SpeciesValues => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  epithet: latinName.split(" ")[1] ?? null,
  cultivar: null,
  germanName: null,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  softLeaf: false,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Triebe werden lang und dünn.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Kompakter Wuchs.",
  botanicalStory: null,
  source: null,
  ...extra,
});
const names = (w: SpeciesValues): SpeciesName[] => [
  { field: "latin", display: w.latinName, norm: w.latinName.toLowerCase() },
];

async function create(w: SpeciesValues, approved: boolean): Promise<string> {
  const r = await species.create(anna, w, names(w));
  if (r.kind !== "fresh") throw new Error("duplicate");
  if (approved) {
    const v = await withAccount(owner, operator, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [r.value.id]),
    );
    if (!(await new ReviewPostgres(owner).decide(operator, v.rows[0]?.id ?? "", "reviewed", null)))
      throw new Error("approval failed");
  }
  return r.value.id;
}

const snapshot = (speciesId: string, source: SnapshotRecord["source"]): SnapshotRecord => ({
  speciesId,
  source,
  sourceId: source === "wikipedia" ? null : "123",
  retrievedAt: "2026-10-18T10:00:00.000Z",
  link: `https://example.org/${source}`,
  license: source === "wikipedia" ? "CC-BY-SA-4.0" : "CC0-1.0",
  raw: source === "wikipedia" ? null : { usageKey: 123 },
});
const all = (id: string) =>
  (["gbif", "wikidata", "wikipedia"] as const).map((s) => snapshot(id, s));
const family = (extra: Partial<FieldValueRecord> = {}): FieldValueRecord => ({
  field: "familyLatin",
  value: "Asphodelaceae",
  origin: "source",
  source: "gbif",
  link: "https://example.org/gbif",
  license: "CC0-1.0",
  retrievedAt: "2026-10-18T10:00:00.000Z",
  disputed: false,
  ...extra,
});
const row = (id: string) =>
  owner
    .query(
      "select family_latin, german_name, botanical_story, version from species where id = $1",
      [id],
    )
    .then((r) => r.rows[0]);
const mine = async (latinName: string) =>
  (await store.candidates()).find((c) => c.latinName === latinName);

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
  store = new CatalogFillPostgres(owner);
  species = new SpeciesPostgres(owner);
  for (const id of [anna, operator])
    await withAccount(owner, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(owner, operator, "operator");
});
afterAll(async () => {
  await admin.query(
    "delete from species where id in (select object_id from review_case where account_id = any($1))",
    [[anna, operator]],
  );
  await admin.query("delete from account where id = any($1)", [[anna, operator]]);
  await Promise.all([owner.end(), admin.end()]);
});

describe("US-BES-12 database adapter of the catalog fill", () => {
  it("US-BES-12 lists only approved species with a gap and names the empty fields", async () => {
    const approved = await create(values(`Fillus gapus${run}`), true);
    await create(values(`Fillus privatus${run}`), false);
    await create(
      values(`Fillus plenus${run}`, {
        familyLatin: "X",
        germanName: "Voll",
        botanicalStory: "Story.",
      }),
      true,
    );
    expect((await store.candidates()).map((c) => c.latinName)).toContain(`Fillus gapus${run}`);
    expect(await mine(`Fillus privatus${run}`)).toBeUndefined();
    expect(await mine(`Fillus plenus${run}`)).toBeUndefined();
    expect((await mine(`Fillus gapus${run}`))?.empty).toEqual([
      "familyLatin",
      "germanName",
      "botanicalStory",
    ]);
    expect(approved).toBeTruthy();
  });

  it("US-BES-12 DM-BES-05 DM-BES-06 FR-BES-12 stores the snapshots and the values with their origin and raises the version once", async () => {
    const id = await create(values(`Fillus recordus${run}`), true);
    const before = (await row(id)).version as number;
    await store.record(id, all(id), [
      family(),
      family({ field: "germanName", value: "Testpflanze", source: "wikidata", disputed: true }),
    ]);
    expect(await row(id)).toMatchObject({
      family_latin: "Asphodelaceae",
      german_name: "Testpflanze",
      botanical_story: null,
      version: before + 1,
    });
    const snaps = await owner.query(
      "select source, source_id, raw, license from catalog_source_snapshot where species_id = $1 order by source",
      [id],
    );
    expect(snaps.rows).toEqual([
      { source: "gbif", source_id: "123", raw: { usageKey: 123 }, license: "CC0-1.0" },
      { source: "wikidata", source_id: "123", raw: { usageKey: 123 }, license: "CC0-1.0" },
      { source: "wikipedia", source_id: null, raw: null, license: "CC-BY-SA-4.0" },
    ]);
    const prov = await owner.query(
      "select field, version, value, origin, source, link, license, to_char(retrieved_on,'YYYY-MM-DD') as day, disputed from catalog_field_provenance where species_id = $1 order by field",
      [id],
    );
    expect(prov.rows).toEqual([
      {
        field: "family_latin",
        version: before + 1,
        value: "Asphodelaceae",
        origin: "source",
        source: "gbif",
        link: "https://example.org/gbif",
        license: "CC0-1.0",
        day: "2026-10-18",
        disputed: false,
      },
      expect.objectContaining({ field: "german_name", disputed: true, version: before + 1 }),
    ]);
  });

  it("US-BES-12 a species with the snapshots of GBIF and Wikipedia is not asked again (Wikidata only when the article names an item), also when a field stayed unknown (P-08)", async () => {
    const id = await create(values(`Fillus once${run}`), true);
    expect(await mine(`Fillus once${run}`)).toBeDefined();
    await store.record(
      id,
      all(id).filter((s) => s.source !== "wikidata"),
      [],
    );
    expect(await mine(`Fillus once${run}`)).toBeUndefined();
    expect((await row(id)).family_latin).toBeNull();
  });

  it("US-BES-12 FR-BES-19 a value set meanwhile stays: no overwrite, no provenance, no new version", async () => {
    const id = await create(values(`Fillus reviewus${run}`, { familyLatin: "Reviewed" }), true);
    const before = (await row(id)).version as number;
    await store.record(id, all(id), [family()]);
    expect(await row(id)).toMatchObject({ family_latin: "Reviewed", version: before });
    const prov = await owner.query("select 1 from catalog_field_provenance where species_id = $1", [
      id,
    ]);
    expect(prov.rowCount).toBe(0);
  });

  it("US-BES-12 all or nothing: a failing value leaves neither snapshots nor fields behind (P-10)", async () => {
    const id = await create(values(`Fillus broken${run}`), true);
    await expect(store.record(id, all(id), [family({ link: "not-a-link" })])).rejects.toThrow();
    expect(await row(id)).toMatchObject({ family_latin: null });
    const snaps = await owner.query("select 1 from catalog_source_snapshot where species_id = $1", [
      id,
    ]);
    expect(snaps.rowCount).toBe(0);
  });

  it("US-BES-12 P-05 keepers read snapshots and provenance of approved species but can change neither the tables nor the species", async () => {
    const id = await create(values(`Fillus lesbar${run}`), true);
    await store.record(id, all(id), [family()]);
    const seen = await withAccount(owner, anna, (c) =>
      c.query("select count(*)::int as n from catalog_field_provenance where species_id = $1", [
        id,
      ]),
    );
    expect(seen.rows[0]?.n).toBe(1);
    for (const sql of [
      "insert into catalog_source_snapshot (species_id, source, retrieved_at, link, license) values ($1, 'gbif', now(), 'https://x.org', 'CC0-1.0')",
      "delete from catalog_field_provenance where species_id = $1",
      "update species set family_latin = 'Hacked' where id = $1",
    ])
      await expect(withAccount(owner, anna, (c) => c.query(sql, [id]))).rejects.toThrow(
        /permission denied/,
      );
  });

  it("US-BES-12 the owner role changes species only inside the fill transaction", async () => {
    const id = await create(values(`Fillus gesperrt${run}`), true);
    const r = await owner.query("update species set family_latin = 'Rogue' where id = $1", [id]);
    expect(r.rowCount).toBe(0);
  });

  it("US-BES-12 the schema check accepts the new shared tables", async () => {
    expect(await findSchemaViolations(owner)).toEqual([]);
  });
});

describe("US-BES-13 gap list store", () => {
  it("US-BES-13 returns approved species with unknown fields as null and their source snapshots, not proposals", async () => {
    const approved = await create(values(`Gapstore ${run}`, { substrate: "Sand" }), true);
    const proposal = await create(values(`Gapproposal ${run}`), false);
    await store.record(approved, [snapshot(approved, "gbif")], []);
    const rows = await new CatalogGapsPostgres(owner).approvedSpecies(anna);
    const found = rows.find((r) => r.id === approved);
    expect(found?.values.substrate).toBe("Sand");
    expect(found?.values.germanName).toBeNull();
    expect(found?.checks).toEqual([{ source: "gbif", retrievedAt: "2026-10-18T10:00:00Z" }]);
    expect(rows.some((r) => r.id === proposal)).toBe(false);
  });
});

describe("US-BES-12 operator batch store of the start catalog (#991)", () => {
  const latin = `Batchgenus ${run}`;
  const record = (name: string, german: string | null): LoadRecord => ({
    latinName: name,
    genus: name.split(" ")[0] ?? name,
    epithet: name.split(" ")[1] ?? "x",
    germanName: german,
    englishName: null,
    familyLatin: "Araceae",
    familyGerman: null,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 8000,
    growthMeasure: "height",
    etiolationSigns: "Lange Triebe.",
    successCriteria: "Kompakt.",
    source: "test",
    names: [{ field: "latin", display: name, norm: name.toLowerCase() }],
  });
  const provenance = { license: "CC0-1.0", retrievedOn: "2026-10-30" };

  afterAll(async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      await c.query("delete from species where latin_name like $1", [`Batchgenus ${run}%`]);
      await c.query("commit");
    } finally {
      c.release();
    }
  });

  it("US-BES-12 the batch stores curated operator species with provenance, once, and skips present ones", async () => {
    const batch = new CatalogLoadPostgres(owner);
    const operatorAccount = operator;
    const rows = [record(`${latin} alpha`, "Deutsch"), record(`${latin} beta`, null)];
    expect(await batch.load(operatorAccount, rows, provenance)).toEqual(
      rows.map((r) => r.latinName),
    );
    expect(await batch.load(operatorAccount, rows, provenance)).toEqual([]);
    const present = await batch.presentLatin(rows.map((r) => r.names[0]?.norm ?? ""));
    expect(present.size).toBe(2);
    const stored = await admin.query(
      `select count(*)::int as n from catalog_field_provenance f join species s on s.id = f.species_id
        where s.latin_name like $1`,
      [`${latin}%`],
    );
    expect(stored.rows[0]).toEqual({ n: 3 }); // two families and one German name; the unknown name has no row
  });

  it("US-BES-12 P-04 an account without the operator role cannot create operator species and nothing is stored", async () => {
    const batch = new CatalogLoadPostgres(owner);
    await expect(batch.load(anna, [record(`${latin} gamma`, null)], provenance)).rejects.toThrow(
      /operator|reviewer|row-level security/,
    );
    const r = await admin.query("select 1 from species where latin_name = $1", [`${latin} gamma`]);
    expect(r.rowCount).toBe(0);
  });
});
