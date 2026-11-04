import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "./kernel/index.ts";
import { assignRole } from "./fixtures.ts";
import { ReviewPostgres, SpeciesPostgres } from "./catalog/index.ts";
import { searchQuery } from "./catalog/species/species-read.ts";
import type { SpeciesName, SpeciesValues } from "./catalog/species/species.ts";

// NFR-12, issue #1235: the review status and the creator of a species are stored on the species row (migration 0102)
// and kept current by triggers on the review case. The row rules do not change (FR-BES-11, US-BES-10, P-04): these
// tests prove that the copy follows every change of the case and that the plan of the species table no longer calls a
// function per row. Real PostgreSQL, the owner role under row security (`make db-up`).
let pool: Pool;
// Deliberate observation of the stored columns and cleanup across accounts: needs the superuser.
let admin: Pool;
let species: SpeciesPostgres;
const [anna, ben, operator] = [randomUUID(), randomUUID(), randomUUID()];
const all = [anna, ben, operator];

const values = (latin: string, extra: Partial<SpeciesValues> = {}): SpeciesValues => ({
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
  ...extra,
});
const norm = (s: string) => s.toLowerCase();
const names = (w: SpeciesValues): SpeciesName[] => [
  { field: "latin", display: w.latinName, norm: norm(w.latinName) },
  ...(w.germanName
    ? [{ field: "german" as const, display: w.germanName, norm: norm(w.germanName) }]
    : []),
  ...w.synonyms.map((s) => ({ field: "synonym" as const, display: s, norm: norm(s) })),
];
// Unique names per run, so repeated runs do not see each other as duplicates.
const run = randomUUID().slice(0, 8);
const name = (base: string) => `${base}${run}`;

const create = async (user: string, w: SpeciesValues) => {
  const r = await species.create(user, w, names(w));
  if (r.kind !== "fresh") throw new Error("Dublette");
  return r.value;
};
const caseOf = async (speciesId: string) => {
  const r = await admin.query<{ id: string; status: string }>(
    "select id, status from review_case where object_kind = 'species' and object_id = $1",
    [speciesId],
  );
  if (!r.rows[0]) throw new Error("no review case");
  return r.rows[0];
};
/** The stored copy on the species row, read by the superuser (no row rules). */
const copied = async (speciesId: string) => {
  const r = await admin.query<{ review_status: string | null; review_account: string | null }>(
    "select review_status, review_account from species where id = $1",
    [speciesId],
  );
  return r.rows[0];
};
const decide = async (id: string, status: "reviewed" | "rejected", reason: string | null) => {
  const r = await new ReviewPostgres(pool).decide(operator, id, status, reason);
  if (!r) throw new Error("decision failed");
  return r;
};
const approve = async (speciesId: string) => decide((await caseOf(speciesId)).id, "reviewed", null);
/** Rows of the species table as one account sees them (the application role, row rules applied). */
const seenIds = (user: string, ids: string[]) =>
  withAccount(pool, user, async (c) => {
    const r = await c.query<{ id: string }>("select id from species where id = any($1::uuid[])", [
      ids,
    ]);
    return r.rows.map((x) => x.id).sort();
  });
const plan = (user: string, sql: string, params: unknown[] = []) =>
  withAccount(pool, user, async (c) => {
    const r = await c.query<{ "QUERY PLAN": string }>(`explain (costs off) ${sql}`, params);
    return r.rows.map((x) => x["QUERY PLAN"]).join("\n");
  });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = new SpeciesPostgres(pool);
  for (const id of all)
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(pool, operator, "operator");
});
afterAll(async () => {
  // A merged proposal references its target (restrict): its species and case go first, then the rest.
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id = any($1) and status = 'merged')`,
    [all],
  );
  await admin.query("delete from review_case where account_id = any($1) and status = 'merged'", [
    all,
  ]);
  await admin.query(
    "delete from species where id in (select object_id from review_case where account_id = any($1))",
    [all],
  );
  await admin.query("delete from account where id = any($1)", [all]);
  await admin.end();
  await pool.end();
});

describe("NFR-12 the review status is copied to the species row", () => {
  it("NFR-12 a new proposal stores its status and creator on the species row", async () => {
    const p = await create(anna, values(name("Copia nova ")));
    expect(await copied(p.id)).toEqual({ review_status: "proposal", review_account: anna });
  });

  it("NFR-12 an approval and a rejection are copied, the rejection reason stays with the creator", async () => {
    const approved = await create(anna, values(name("Copia freigegeben ")));
    await approve(approved.id);
    expect(await copied(approved.id)).toEqual({ review_status: "reviewed", review_account: anna });

    const rejected = await create(anna, values(name("Copia abgelehnt ")));
    await decide((await caseOf(rejected.id)).id, "rejected", "Zu unklar");
    expect(await copied(rejected.id)).toEqual({ review_status: "rejected", review_account: anna });
    expect(await species.find(ben, rejected.id)).toBeNull();
    expect(await species.find(anna, rejected.id)).toMatchObject({
      reviewStatus: "rejected",
      reviewReason: "Zu unklar",
      own: true,
    });
  });

  it("NFR-12 a merged proposal is copied as merged: nobody sees it, its creator included", async () => {
    const target = await create(anna, values(name("Copia ziel ")));
    await approve(target.id);
    const proposal = await create(anna, values(name("Copia dublette ")));
    const outcome = await new ReviewPostgres(pool).merge(
      operator,
      (await caseOf(proposal.id)).id,
      target.id,
    );
    expect(outcome).not.toBeNull();
    expect(await copied(proposal.id)).toEqual({ review_status: "merged", review_account: anna });
    expect(await species.find(anna, proposal.id)).toBeNull();
    expect(await species.find(ben, proposal.id)).toBeNull();
    expect(await seenIds(operator, [proposal.id])).toEqual([]);
  });

  it("NFR-12 erasing the creator of an open proposal clears the creator; reviewers still see it while it is open", async () => {
    const open = await create(anna, values(name("Copia erloschen ")));
    await admin.query("update review_case set account_id = null where id = $1", [
      (await caseOf(open.id)).id,
    ]);
    expect(await copied(open.id)).toEqual({ review_status: "proposal", review_account: null });
    expect(await species.find(anna, open.id)).toBeNull();
    expect(await species.find(ben, open.id)).toBeNull();
    expect(await species.findForReview(operator, open.id)).toMatchObject({ id: open.id });
  });

  it("NFR-12 erasing the creator of an approved species keeps it visible to everybody", async () => {
    const approved = await create(anna, values(name("Copia bleibt ")));
    await approve(approved.id);
    await admin.query("update review_case set account_id = null where object_id = $1", [
      approved.id,
    ]);
    expect(await copied(approved.id)).toEqual({ review_status: "reviewed", review_account: null });
    expect(await species.find(ben, approved.id)).toMatchObject({ reviewStatus: "reviewed" });
  });
});

describe("NFR-12 the row rules are unchanged, now as column predicates", () => {
  it("NFR-12 a stranger neither reads a private species nor its names, the creator reads both", async () => {
    const p = await create(anna, values(name("Copia privat ")));
    expect(await seenIds(ben, [p.id])).toEqual([]);
    expect(await seenIds(anna, [p.id])).toEqual([p.id]);
    const namesSeen = (user: string) =>
      withAccount(pool, user, async (c) => {
        const r = await c.query("select 1 from species_name where species_id = $1", [p.id]);
        return r.rowCount;
      });
    expect(await namesSeen(ben)).toBe(0);
    expect(await namesSeen(anna)).toBeGreaterThan(0);
  });

  it("NFR-12 reviewers read the names of an open proposal of another account, not of a merged or rejected one", async () => {
    const open = await create(anna, values(name("Copia offen ")));
    const rejected = await create(anna, values(name("Copia verworfen ")));
    await decide((await caseOf(rejected.id)).id, "rejected", "Doppelt");
    const namesSeen = (id: string) =>
      withAccount(pool, operator, async (c) => {
        const r = await c.query("select 1 from species_name where species_id = $1", [id]);
        return r.rowCount;
      });
    expect(await namesSeen(open.id)).toBeGreaterThan(0);
    expect(await namesSeen(rejected.id)).toBe(0);
    expect(await seenIds(operator, [open.id, rejected.id])).toEqual([open.id]);
  });
});

describe("NFR-12 the species list calls no function per row", () => {
  it("NFR-12 the visibility of the species table is a column predicate: no SubPlan, no review lookup", async () => {
    const text = await plan(anna, "select id from species");
    expect(text).toMatch(/review_status/);
    expect(text).not.toMatch(/SubPlan/);
    expect(text).not.toMatch(/species_status|species_own|is_open_proposal|review_case/);
  });

  it("NFR-12 the search reads species_name and calls no function per species", async () => {
    const text = await plan(anna, searchQuery("ruheq").text, searchQuery("ruheq").values);
    expect(text).toMatch(/species_name/);
    expect(text).not.toMatch(/species_status|species_own|is_open_proposal/);
  });

  it("NFR-12 the search lists a species once, with the first name field that matches", async () => {
    const p = await create(
      anna,
      values(name("Zetaquelle alpha "), { synonyms: [`zetasyn${run}`] }),
    );
    const hits = await species.search(anna, `zetaquelle`);
    const mine = hits.filter((h) => h.id === p.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.hit).toEqual({ field: "latin", display: p.latinName });
    expect(await species.search(ben, `zetaquelle`)).toEqual([]);
  });
});
