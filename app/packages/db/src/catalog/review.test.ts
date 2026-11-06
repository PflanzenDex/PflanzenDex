import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  withAccount,
  migrate,
  openOwnerPool,
  checkTenantIsolation,
  openFixturePool,
} from "../kernel/index.ts";
import {
  FIXTURES,
  createFixtureSpeciesAt,
  readRoleTable,
  writeInRoleTable,
  assignRole,
} from "../fixtures.ts";
import { ReviewPostgres, SpeciesPostgres } from "./index.ts";
import type { SpeciesValues } from "./species/species.ts";

// TE-08: roles and review status against a real PostgreSQL; the rights apply even without the operations from `core`.
let pool: Pool;
// Deliberate cross-tenant cleanup/observation of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let store: ReviewPostgres;
const [keeper, foreign, operator, reviewer] = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
];
const all = [keeper, foreign, operator, reviewer];

const proposal = () => ({
  objectKind: "species",
  objectId: randomUUID(),
  status: "proposal" as const,
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new ReviewPostgres(pool);
  for (const id of all)
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(pool, operator, "operator");
  await assignRole(pool, reviewer, "reviewer");
});
afterAll(async () => {
  // A merged case points at its target species (restrict key), so the cleanup runs without the foreign-key triggers.
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      "delete from species where id in (select object_id from review_case where account_id = any($1))",
      [all],
    );
    await client.query("delete from account where id = any($1)", [all]);
    await client.query("commit");
  } finally {
    client.release();
  }
  await admin.end();
  await pool.end();
});

describe("roles (FR-BES-14)", () => {
  it("everyone sees only their own roles", async () => {
    expect(await store.roles(keeper)).toEqual([]);
    expect(await store.roles(operator)).toEqual(["operator"]);
    expect(await store.roles(reviewer)).toEqual(["reviewer"]);
  });

  it("the application can neither read nor assign roles (no self-access to the table)", async () => {
    await expect(readRoleTable(pool, keeper)).rejects.toThrow(/permission denied/);
    await expect(writeInRoleTable(pool, keeper)).rejects.toThrow(/permission denied/);
    expect(await store.roles(keeper)).toEqual([]);
  });
});

describe("review status: users can only propose", () => {
  it("a user creates a proposal; a second one for the same object is reported as present", async () => {
    const v = proposal();
    const r = await store.create(keeper, v);
    expect(r).toMatchObject({ creatorId: keeper, status: "proposal", reviewedBy: null });
    expect(await store.create(foreign, v)).toBe("present");
  });

  it.each(["reviewed", "curated", "rejected"] as const)(
    "a user cannot create anything as %s (database rejects)",
    async (status) => {
      await expect(store.create(keeper, { ...proposal(), status })).rejects.toThrow();
    },
  );

  it("the creator cannot change the status of their proposal themselves", async () => {
    const r = await store.create(keeper, proposal());
    const id = typeof r === "string" ? "" : r.id;
    await expect(store.decide(keeper, id, "reviewed", null)).rejects.toThrow(
      /operators or reviewers/,
    );
    await expect(
      withAccount(pool, keeper, (c) =>
        c.query("update review_case set status = 'curated' where id = $1", [id]),
      ),
    ).rejects.toThrow(/operators or reviewers/);
    expect((await store.find(keeper, id))?.status).toBe("proposal");
  });

  it("another user does not see the case", async () => {
    const r = await store.create(keeper, proposal());
    const id = typeof r === "string" ? "" : r.id;
    expect(await store.find(foreign, id)).toBeNull();
    expect(
      await store.decide(foreign, id, "reviewed", null).catch(() => "rejected"),
    ).not.toMatchObject({ status: "reviewed" });
  });
});

describe("review status: only operators and reviewers decide", () => {
  it.each([operator, reviewer])(
    "reviewer %s approves a foreign proposal; the note comes from the session",
    async (who) => {
      const r = await store.create(keeper, proposal());
      const id = typeof r === "string" ? "" : r.id;
      const fresh = await store.decide(who, id, "reviewed", null);
      expect(fresh).toMatchObject({ status: "reviewed", reviewedBy: who, creatorId: keeper });
      expect(await store.find(keeper, id)).toMatchObject({ status: "reviewed" });
    },
  );

  it("rejecting needs a reason (database), and the creator sees it", async () => {
    const r = await store.create(keeper, proposal());
    const id = typeof r === "string" ? "" : r.id;
    await expect(store.decide(operator, id, "rejected", null)).rejects.toThrow();
    await store.decide(operator, id, "rejected", "Source missing");
    expect(await store.find(keeper, id)).toMatchObject({
      status: "rejected",
      reason: "Source missing",
    });
  });

  it("a reviewer cannot change assignment and creator of a foreign case", async () => {
    const r = await store.create(keeper, proposal());
    const id = typeof r === "string" ? "" : r.id;
    for (const sql of [
      "account_id = $2",
      "object_id = gen_random_uuid()",
      "object_kind = 'other'",
    ]) {
      await expect(
        withAccount(pool, operator, (c) =>
          c.query(
            `update review_case set ${sql} where id = $1`,
            sql.includes("$2") ? [id, operator] : [id],
          ),
        ),
      ).rejects.toThrow(/immutable/);
    }
  });

  it("an operator batch is immediately `curated`; a user may not do that", async () => {
    const r = await store.create(operator, { ...proposal(), status: "curated" });
    expect(r).toMatchObject({ status: "curated", reviewedBy: operator });
  });
});

describe("P-04: the operator sees no content of other accounts", () => {
  it("with the operator role the generic tenant test passes for every table except the review list", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await withAccount(pool, a, (c) => c.query("insert into account (id) values ($1)", [a]));
    await assignRole(pool, a, "operator");
    await createFixtureSpeciesAt();
    const problems = await checkTenantIsolation(pool, FIXTURES, [a, b], admin);
    // The only exception, deliberately: reviewers read the review list (kind, id and status of the object, no content).
    expect(problems.filter((p) => !p.startsWith("review_case:"))).toEqual([]);
    // Reading and a no-op update on the review list are the reviewer right; reassigning, deleting and injecting stay forbidden.
    expect(problems.every((p) => /^review_case: (reads rows|changes \d+ instead)/.test(p))).toBe(
      true,
    );
    expect(problems).toContain("review_case: reads rows of a foreign account");
  });

  it("the review list contains metadata only", async () => {
    const columns = await pool.query(
      "select column_name from information_schema.columns where table_name = 'review_case' order by 1",
    );
    expect(columns.rows.map((z) => z.column_name)).toEqual([
      "account_id",
      "created_at",
      "id",
      "merged_into",
      "object_id",
      "object_kind",
      "reason",
      "reviewed_at",
      "reviewed_by",
      "status",
    ]);
  });
});

describe("US-BES-10 merge lock", () => {
  it("US-BES-10 a case whose species row cannot be locked answers lock_failed, not 'decided', and changes nothing", async () => {
    const r = await store.create(keeper, proposal());
    const id = typeof r === "string" ? "" : r.id;
    expect(await store.merge(reviewer, id, randomUUID())).toBe("lock_failed");
    const still = await withAccount(pool, reviewer, (c) =>
      c.query<{ status: string }>("select status from review_case where id = $1", [id]),
    );
    expect(still.rows[0]?.status).toBe("proposal");
  });
});

describe("NFR-12 review lists keep their order with the partial indexes", () => {
  it("NFR-12 the partial indexes carry the predicates of the two review lists", async () => {
    const { rows } = await admin.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in ('review_case_open', 'review_case_curated_species')",
    );
    const def = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(def.review_case_open).toContain("(created_at, id) WHERE");
    expect(def.review_case_open).toContain("'proposal'::text");
    expect(def.review_case_open).toContain("'ai_unreviewed'::text");
    expect(def.review_case_curated_species).toContain("(created_at DESC, id) WHERE");
    expect(def.review_case_curated_species).toContain("'curated'::text");
    expect(def.review_case_curated_species).toContain("'species'::text");
  });

  it("NFR-12 open cases come oldest first, curated batches newest first, whatever the insert order", async () => {
    // Dates far in the future make these rows the newest batches; the rows are removed again afterwards.
    const inserted: string[] = [];
    try {
      const proposal = (created: string) =>
        withAccount(pool, keeper, (c) =>
          c.query<{ id: string }>(
            "insert into review_case (account_id, object_kind, object_id, status, created_at) values ($1, 'species', $2, 'proposal', $3) returning id",
            [keeper, randomUUID(), created],
          ),
        );
      const batch = (created: string) =>
        withAccount(pool, operator, (c) =>
          c.query<{ id: string }>(
            "insert into review_case (account_id, object_kind, object_id, status, created_at) values ($1, 'species', $2, 'curated', $3) returning id",
            [operator, randomUUID(), created],
          ),
        );
      // Inserted out of order on purpose: the order has to come from created_at.
      const p3 = (await proposal("2090-03-01T10:00:20Z")).rows[0]?.id ?? "";
      const p1 = (await proposal("2090-03-01T10:00:00Z")).rows[0]?.id ?? "";
      const p2 = (await proposal("2090-03-01T10:00:10Z")).rows[0]?.id ?? "";
      const b2 = (await batch("2090-06-02T10:00:00Z")).rows[0]?.id ?? "";
      const b3 = (await batch("2090-06-03T10:00:00Z")).rows[0]?.id ?? "";
      const b1 = (await batch("2090-06-01T10:00:00Z")).rows[0]?.id ?? "";
      inserted.push(p1, p2, p3, b1, b2, b3);
      const ours = (await store.listForReview(reviewer))
        .map((r) => r.id)
        .filter((id) => inserted.includes(id));
      expect(ours).toEqual([p1, p2, p3, b3, b2, b1]);
    } finally {
      await admin.query("delete from review_case where id = any($1)", [inserted]);
    }
  });
});

// US-BES-10, P-10: an approval refuses a Latin name that an approved species already has. The check and the decision
// run in one transaction under an advisory lock on the name (real PostgreSQL). The key is the lower-case Latin name,
// which is what the core computes as the key of the name for these fixtures.
describe("US-BES-10 approval refuses a Latin name that an approved species already has", () => {
  const run = randomUUID().slice(0, 8);
  const key = (label: string) => `twin ${run} ${label}`;
  const values = (latinName: string): SpeciesValues => ({
    latinName,
    genus: latinName.split(" ")[0] ?? latinName,
    epithet: null,
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

  /** A proposal of `creator` under the Latin name `latin`; returns the species and its review case. */
  async function proposal(creator: string, latin: string) {
    const r = await new SpeciesPostgres(pool).create(creator, values(latin), [
      { field: "latin", display: latin, norm: latin },
    ]);
    if (r.kind !== "fresh") throw new Error(`duplicate: ${latin}`);
    const cases = await withAccount(pool, operator, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [r.value.id]),
    );
    return { speciesId: r.value.id, caseId: cases.rows[0]?.id ?? "" };
  }

  /** An operator batch entry, approved at once (`curated`): the case first, then the species and its name, as the load writes it. */
  async function curated(latin: string): Promise<string> {
    const id = randomUUID();
    await withAccount(pool, operator, async (c) => {
      await c.query(
        "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'curated')",
        [operator, id],
      );
      await c.query(
        `insert into species (id, created_by, latin_name, genus, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria)
         values ($1, 'operator', $2, $3, 1, 2, 15000, 'height', 'Triebe werden lang.', 'Kompakter Wuchs.')`,
        [id, latin, latin.split(" ")[0]],
      );
      await c.query(
        "insert into species_name (species_id, field, display, norm) values ($1, 'latin', $2, $3)",
        [id, latin, latin],
      );
    });
    return id;
  }

  it("US-BES-10 approving with the key is refused when a reviewed species has it, and when a curated one has it", async () => {
    const reviewed = key("reviewed");
    const a = await proposal(keeper, reviewed);
    const b = await proposal(foreign, reviewed);
    expect(await store.approve(operator, a.caseId, reviewed)).toMatchObject({
      status: "reviewed",
    });
    expect(await store.approve(operator, b.caseId, reviewed)).toEqual({
      twin: { id: a.speciesId, latinName: reviewed },
    });
    expect(await store.find(foreign, b.caseId)).toMatchObject({ status: "proposal" });

    const batch = key("curated");
    const c = await proposal(keeper, batch);
    const d = await proposal(foreign, batch);
    const curatedId = await curated(batch);
    expect(await store.approve(operator, d.caseId, batch)).toEqual({
      twin: { id: curatedId, latinName: batch },
    });
    expect(await store.find(keeper, c.caseId)).toMatchObject({ status: "proposal" });
  });

  it("US-BES-10 a proposal's own Latin name does not count against itself", async () => {
    const own = key("own");
    const p = await proposal(keeper, own);
    expect(await store.approve(operator, p.caseId, own)).toMatchObject({
      status: "reviewed",
    });
  });

  it("US-BES-10 two proposals of one new name approved at the same moment: exactly one is approved, the other names its twin", async () => {
    for (let round = 0; round < 20; round++) {
      const latin = key(`race ${round}`);
      const a = await proposal(keeper, latin);
      const b = await proposal(foreign, latin);
      const results = await Promise.all([
        store.approve(operator, a.caseId, latin),
        store.approve(operator, b.caseId, latin),
      ]);
      const approved = results.filter((r) => r !== null && "status" in r);
      const twins = results.filter((r) => r !== null && "twin" in r);
      expect(approved, `round ${round}`).toHaveLength(1);
      expect(twins, `round ${round}`).toHaveLength(1);
    }
  });

  it("US-BES-10 a rejected species and a merged species of that name are no twin", async () => {
    const rejected = key("rejected");
    const first = await proposal(keeper, rejected);
    const next = await proposal(foreign, rejected);
    await store.decide(operator, first.caseId, "rejected", "Quelle fehlt");
    expect(await store.approve(operator, next.caseId, rejected)).toMatchObject({
      status: "reviewed",
    });

    const mergedName = key("merged");
    const gone = await proposal(keeper, mergedName);
    const again = await proposal(foreign, mergedName);
    const target = await proposal(keeper, key("target"));
    await store.approve(operator, target.caseId, key("target"));
    const merged = await store.merge(operator, gone.caseId, target.speciesId);
    expect(merged !== null && typeof merged === "object" && merged.reviewCase.status).toBe(
      "merged",
    );
    expect(await store.approve(operator, again.caseId, mergedName)).toMatchObject({
      status: "reviewed",
    });
  });

  it("US-BES-10 a plant keeper cannot approve with the check either (the role rules hold)", async () => {
    const name = key("keeper");
    const mine = await proposal(keeper, name);
    await expect(store.approve(keeper, mine.caseId, name)).rejects.toThrow(
      /operators or reviewers/,
    );
    expect(await store.find(keeper, mine.caseId)).toMatchObject({ status: "proposal" });
  });

  it("US-BES-10 approvedDuplicates finds approved species that share a Latin name and ignores proposals", async () => {
    const latin = key("dup");
    const a = await proposal(keeper, latin);
    const b = await proposal(foreign, latin);
    const open = await proposal(operator, latin);
    expect(await store.approve(operator, a.caseId, latin)).toMatchObject({
      status: "reviewed",
    });
    // Without the key, as a batch load writes it: the check is per approval, so the second one is approved as well.
    expect(await store.decide(operator, b.caseId, "reviewed", null)).toMatchObject({
      status: "reviewed",
    });
    const group = (await store.approvedDuplicates(operator)).find((g) => g.latinName === latin);
    expect(group?.species.map((s) => s.id).sort()).toEqual([a.speciesId, b.speciesId].sort());
    expect(group?.species.map((s) => s.id)).not.toContain(open.speciesId);
  });
});
