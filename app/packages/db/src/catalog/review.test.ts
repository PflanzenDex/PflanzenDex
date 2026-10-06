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
import { ReviewPostgres } from "./index.ts";

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
  await admin.query("delete from account where id = any($1)", [all]);
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
