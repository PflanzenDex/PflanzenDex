import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  befriend,
  createAccountWithName,
  assignRole,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "./fixtures.ts";
import { ReviewPostgres, SpeciesPostgres } from "./catalog/index.ts";
import type { SpeciesName, SpeciesValues } from "./catalog/species/species.ts";

// NFR-12, #907, P-04, QG-D1: the copy of the review status to the species row (triggers `species_review_copy` and
// `review_case_species_sync`, both `security definer`) with a SUPERUSER as owner of the tables (a scratch database, see
// createSuperuserOwnerDatabase). A superuser owner is not bound by row security, so the copy must name the case of the
// species it copies, and the visibility must still hold for the application role: friend, stranger, no flag.
let db: SuperuserOwnerDatabase;
let pool: Pool;
let species: SpeciesPostgres;
const [anna, cleo, ben, operator] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

const values = (latin: string): SpeciesValues => ({
  latinName: latin,
  genus: latin.split(" ")[0] ?? latin,
  epithet: latin.split(" ")[1] ?? null,
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
const names = (w: SpeciesValues): SpeciesName[] => [
  { field: "latin", display: w.latinName, norm: w.latinName.toLowerCase() },
];
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("species-visibility");
  pool = db.pool;
  species = new SpeciesPostgres(pool);
  for (const [id, label] of [
    [anna, "Anna"],
    [cleo, "Cleo"],
    [ben, "Ben"],
    [operator, "Operator"],
  ] as const)
    await createAccountWithName(pool, id, `NFR12-${label}-${run}`);
  await befriend(pool, anna, cleo);
  await assignRole(pool, operator, "operator");
});
afterAll(async () => {
  await db.drop();
});

describe("NFR-12 the review status copy with a superuser as table owner (#907)", () => {
  it("NFR-12 the proposal of a keeper is copied to the species row and seen by the friend and the stranger only as the rule says", async () => {
    const w = values(`Copia super ${run}`);
    const r = await species.create(anna, w, names(w));
    if (r.kind !== "fresh") throw new Error("Dublette");
    const row = await db.pool.query<{ review_status: string; review_account: string }>(
      "select review_status, review_account from species where id = $1",
      [r.value.id],
    );
    expect(row.rows[0]).toEqual({ review_status: "proposal", review_account: anna });
    // Friendship grants no catalog visibility: a private proposal is for its creator only.
    expect(await species.find(cleo, r.value.id)).toBeNull();
    expect(await species.find(ben, r.value.id)).toBeNull();
    expect(await species.find(anna, r.value.id)).toMatchObject({ own: true });
  });

  it("NFR-12 an approval is copied, and the stranger sees the approved species afterwards", async () => {
    const w = values(`Copia super frei ${run}`);
    const r = await species.create(anna, w, names(w));
    if (r.kind !== "fresh") throw new Error("Dublette");
    const reviewCase = await db.pool.query<{ id: string }>(
      "select id from review_case where object_id = $1",
      [r.value.id],
    );
    await new ReviewPostgres(pool).decide(operator, reviewCase.rows[0]?.id ?? "", "reviewed", null);
    const row = await db.pool.query<{ review_status: string }>(
      "select review_status from species where id = $1",
      [r.value.id],
    );
    expect(row.rows[0]?.review_status).toBe("reviewed");
    expect(await species.find(ben, r.value.id)).toMatchObject({ reviewStatus: "reviewed" });
  });
});
