import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { assignRole } from "../../fixtures.ts";
import {
  CatalogFillPostgres,
  CatalogSourceClaims,
  ReviewPostgres,
  SpeciesPostgres,
} from "../index.ts";
import type { SpeciesName, SpeciesValues } from "../species.ts";

// US-ENT-09 part 2, DM-BES-05: claims read out of the stored Wikidata answers; nothing is asked from any server.
let owner: Pool;
let admin: Pool;
let claims: CatalogSourceClaims;
let species: SpeciesPostgres;
const [anna, operator] = [randomUUID(), randomUUID()];
const run = randomUUID().slice(0, 8);

const values = (latinName: string): SpeciesValues => ({
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
});

async function create(latinName: string, approved: boolean, raw: unknown): Promise<void> {
  const w = values(latinName);
  const names: SpeciesName[] = [
    { field: "latin", display: latinName, norm: latinName.toLowerCase() },
  ];
  const r = await species.create(anna, w, names);
  if (r.kind !== "fresh") throw new Error("duplicate");
  if (approved) {
    const v = await withAccount(owner, operator, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [r.value.id]),
    );
    await new ReviewPostgres(owner).decide(operator, v.rows[0]?.id ?? "", "reviewed", null);
  }
  await new CatalogFillPostgres(owner).record(
    r.value.id,
    [
      {
        speciesId: r.value.id,
        source: "wikidata",
        sourceId: "Q5",
        retrievedAt: "2026-10-18T23:30:00.000Z",
        link: "https://www.wikidata.org/wiki/Q5",
        license: "CC0-1.0",
        raw,
      },
    ],
    [],
  );
}

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
  claims = new CatalogSourceClaims(owner);
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

describe("US-ENT-09 claims of the stored Wikidata answers", () => {
  it("US-ENT-09 lists only approved species whose item has a claim of the property, with date and license", async () => {
    const heights = [{ rank: "normal" }];
    await create(`Claimus altus${run}`, true, { entities: { Q5: { claims: { P2048: heights } } } });
    await create(`Claimus nihilus${run}`, true, { entities: { Q5: { claims: {} } } });
    await create(`Claimus privatus${run}`, false, {
      entities: { Q5: { claims: { P2048: heights } } },
    });
    const found = (await claims.wikidataClaims("P2048")).filter((c) => c.latinName.endsWith(run));
    expect(found).toEqual([
      {
        latinName: `Claimus altus${run}`,
        itemId: "Q5",
        heightClaims: heights,
        retrievedAt: "2026-10-18",
        license: "CC0-1.0",
      },
    ]);
  });

  it("US-ENT-09 refuses anything that is not a Wikidata property id (no SQL from a free string)", async () => {
    await expect(claims.wikidataClaims("P2048'; drop table species")).rejects.toThrow(
      /not a Wikidata property/,
    );
  });
});
