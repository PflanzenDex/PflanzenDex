import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSchemaViolations, withAccount, migrate, openPool } from "../kernel/index.ts";
import { assignRole } from "../fixtures.ts";
import { SpeciesPostgres, ReviewPostgres } from "./index.ts";
import type { SpeciesName, SpeciesValues } from "./species.ts";

// US-BES-01, FR-BES-02, FR-BES-11, E-02: species catalog with private proposals (real PostgreSQL, `make db-up`).
let pool: Pool;
let species: SpeciesPostgres;
const [anna, ben, operator] = [randomUUID(), randomUUID(), randomUUID()];
const all = [anna, ben, operator];

const values = (name: string, extra: Partial<SpeciesValues> = {}): SpeciesValues => ({
  latinName: name,
  genus: name.split(" ")[0] ?? name,
  epithet: name.split(" ")[1] ?? null,
  cultivar: null,
  germanName: null,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
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
/** The operator decides on the review case (TE-08); the UI for it follows with BES-10. */
async function approve(speciesId: string) {
  // The operator finds the case via the review list (reviewers read all cases, metadata only).
  const v = await withAccount(pool, operator, (c) =>
    c.query<{ id: string }>("select id from review_case where object_id = $1", [speciesId]),
  );
  const r = await new ReviewPostgres(pool).decide(operator, v.rows[0]?.id ?? "", "reviewed", null);
  if (!r) throw new Error("Approval failed");
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = new SpeciesPostgres(pool);
  for (const id of all)
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(pool, operator, "operator");
});
afterAll(async () => {
  await pool.query(
    "delete from species where id in (select object_id from review_case where account_id = any($1))",
    [all],
  );
  await pool.query("delete from account where id = any($1)", [all]);
  await pool.end();
});

describe("species catalog: proposal is private (FR-BES-11, P-04, P-05)", () => {
  it("a proposal lands in review status proposal and is visible only to the creator", async () => {
    const a = await create(anna, values(name("Aloe privata ")));
    expect(a).toMatchObject({ reviewStatus: "proposal", createdBy: "user", own: true });
    expect(await species.find(anna, a.id)).toMatchObject({ id: a.id });
    expect(await species.find(ben, a.id)).toBeNull();
    expect(await species.find(operator, a.id)).toBeNull();
    const view = (n: string) => species.search(n, norm(a.latinName));
    expect(await view(anna)).toHaveLength(1);
    expect(await view(ben)).toEqual([]);
  });

  it("the review case hangs on the species and appears in the creator's review list", async () => {
    const a = await create(anna, values(name("Aloe liste ")));
    const r = await withAccount(pool, anna, (c) =>
      c.query("select status, object_kind from review_case where object_id = $1", [a.id]),
    );
    expect(r.rows).toEqual([{ status: "proposal", object_kind: "species" }]);
    const foreign = await withAccount(pool, ben, (c) =>
      c.query("select 1 from review_case where object_id = $1", [a.id]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it("after approval everyone sees the species, marked; nobody learns the creator via the review list", async () => {
    const a = await create(anna, values(name("Aloe frei ")));
    await approve(a.id);
    expect(await species.find(ben, a.id)).toMatchObject({ reviewStatus: "reviewed", own: false });
    expect(await species.find(anna, a.id)).toMatchObject({ own: true });
    const meta = await withAccount(pool, ben, (c) =>
      c.query("select 1 from review_case where object_id = $1", [a.id]),
    );
    expect(meta.rowCount).toBe(0);
  });

  it("even an operator does not see another's private proposal (approval view follows with BES-10)", async () => {
    const a = await create(anna, values(name("Aloe betreiber ")));
    expect(await species.find(operator, a.id)).toBeNull();
  });
});

describe("species catalog: row rules and triggers in the database", () => {
  it("species and names have enforced row rules; the application cannot change or delete them", async () => {
    const r = await pool.query(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
        where relname in ('species', 'species_name') order by relname`,
    );
    expect(r.rows).toEqual([
      { relname: "species", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "species_name", relrowsecurity: true, relforcerowsecurity: true },
    ]);
    const a = await create(anna, values(name("Aloe fest ")));
    const update = await withAccount(pool, anna, (c) =>
      c.query("update species set difficulty = 3 where id = $1", [a.id]).catch((e: Error) => e),
    );
    expect(update).toBeInstanceOf(Error);
    await expect(
      withAccount(pool, anna, (c) => c.query("delete from species where id = $1", [a.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("the schema test reports when a catalog table loses its row rule (exception without account id only with a rule)", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table species no force row level security");
      expect(await findSchemaViolations(client)).toEqual([
        expect.stringContaining("Catalog table species:"),
      ]);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("a species without its own review case cannot be created (neither without nor with a foreign one)", async () => {
    const foreign = await create(anna, values(name("Aloe fremd ")));
    const insert = (id: string) =>
      withAccount(pool, ben, (c) =>
        c.query(
          `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux,
             growth_measure, etiolation_signs, success_criteria, created_by)
           values ($1, 'X', 'X', 1, 2, 100, 'height', 'v', 'e', 'user')`,
          [id],
        ),
      );
    await expect(insert(randomUUID())).rejects.toThrow();
    await expect(insert(foreign.id)).rejects.toThrow();
  });

  it("a user cannot pose as operator or reviewer (created_by)", async () => {
    const id = randomUUID();
    const w = values(name("Aloe falsch "));
    await expect(
      withAccount(pool, ben, async (c) => {
        await c.query(
          "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')",
          [ben, id],
        );
        await c.query(
          `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux,
             growth_measure, etiolation_signs, success_criteria, created_by)
           values ($1, 'X', $2, 1, 2, 100, 'height', 'v', 'e', 'operator')`,
          [id, w.latinName],
        );
      }),
    ).rejects.toThrow(/operator|reviewer/);
  });

  it("required fields and value ranges also apply without the operations (difficulty, level, dormancy as a pair)", async () => {
    for (const w of [
      values(name("Aloe a "), { difficulty: 4 }),
      values(name("Aloe b "), { standardLevel: 1 }),
      values(name("Aloe c "), { dormancyFrom: "11-15" }),
      values(name("Aloe d "), { growthMeasure: "weight" as SpeciesValues["growthMeasure"] }),
    ])
      await expect(species.create(anna, w, names(w))).rejects.toThrow();
  });

  it("if creation fails, nothing remains (no partial state, FR-BES-03)", async () => {
    const w = values(name("Aloe teil "), { difficulty: 9 });
    const before = await pool.query(
      "select count(*)::int as n from review_case where account_id = $1",
      [anna],
    );
    await expect(species.create(anna, w, names(w))).rejects.toThrow();
    const after = await pool.query(
      "select count(*)::int as n from review_case where account_id = $1",
      [anna],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("species catalog: search and duplicates", () => {
  it("finds via Latin name, German name and synonym and names the hit (Sansevieria -> Dracaena)", async () => {
    const w = values(name("Dracaena trifasciata "), {
      germanName: name("Bogenhanf "),
      synonyms: [name("Sansevieria trifasciata ")],
    });
    const a = await create(anna, w);
    await approve(a.id);
    const t = async (s: string) => (await species.search(ben, norm(s)))[0]?.hit;
    expect(await t(w.latinName)).toMatchObject({ field: "latin" });
    expect(await t(name("bogenhanf "))).toMatchObject({ field: "german" });
    expect(await t(name("sansevieria trifasciata "))).toMatchObject({
      field: "synonym",
      display: name("Sansevieria trifasciata "),
    });
    expect(
      (await species.search(ben, norm(name("sansevieria trifasciata "))))[0]?.synonyms,
    ).toEqual([name("Sansevieria trifasciata ")]);
  });

  it("references the visible species for the same name or synonym and writes nothing", async () => {
    const a = await create(
      anna,
      values(name("Ficus pumila "), { synonyms: [name("Ficus repens ")] }),
    );
    const same = values(name("Ficus pumila "));
    expect(await species.create(anna, same, names(same))).toMatchObject({
      kind: "duplicate",
      value: { id: a.id },
    });
    const overSynonym = values(name("Ficus repens "));
    expect((await species.create(anna, overSynonym, names(overSynonym))).kind).toBe("duplicate");
    // Another user does not see the private proposal and creates their own (no hint about foreign data).
    expect((await species.create(ben, same, names(same))).kind).toBe("fresh");
  });

  it("search characters % and _ are text, not wildcards; empty search lists only what is visible", async () => {
    expect(await species.search(ben, "%")).toEqual([]);
    const all = await species.search(ben, null);
    expect(all.every((x) => x.own || x.reviewStatus === "reviewed")).toBe(true);
  });
});

describe("species catalog and review status (TE-08)", () => {
  it("the reviewer decides on the existing case; the species stays unchanged and is then visible to everyone", async () => {
    const a = await create(anna, values(name("Aloe prueft ")));
    const review = new ReviewPostgres(pool);
    const v = await withAccount(pool, anna, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [a.id]),
    );
    const id = v.rows[0]?.id ?? "";
    expect(await review.decide(operator, id, "reviewed", null)).toMatchObject({
      status: "reviewed",
    });
    expect(await species.find(ben, a.id)).toMatchObject({
      reviewStatus: "reviewed",
      latinName: a.latinName,
    });
  });
});
