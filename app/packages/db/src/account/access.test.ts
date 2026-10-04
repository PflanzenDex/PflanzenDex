import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  migrate,
  openPool,
  withAccount,
  findSchemaViolations,
  tenantsTables,
} from "../kernel/index.ts";
import { assignRole } from "../fixtures.ts";
import { AccessPostgres, admitAccount } from "./index.ts";

// US-ACC-05 against a real PostgreSQL: invitation codes, the registration mode and the operator overview. The rights
// hold without the operations from `core`: a wrong application cannot get past the database.
let pool: Pool;
let store: AccessPostgres;
const [operator, reviewer, keeper] = [randomUUID(), randomUUID(), randomUUID()];
const people = [operator, reviewer, keeper];
const subjects: string[] = [];
const subject = () => {
  const s = `acc05-${randomUUID()}`;
  subjects.push(s);
  return s;
};
const letters = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const newCode = () =>
  Array.from({ length: 24 }, () => letters[Math.floor(Math.random() * 32)]).join("");
const inOneDay = () => new Date(Date.now() + 86_400_000).toISOString();
const sha256 = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");
const issue = async (code = newCode(), expiresAt = inOneDay()) => {
  await store.createInvitation(operator, { code, expiresAt });
  return code;
};
const accountsOf = async (s: string) =>
  (await pool.query("select count(*)::int as n from account where subject = $1", [s])).rows[0].n;

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  store = new AccessPostgres(pool);
  for (const id of people)
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(pool, operator, "operator");
  await assignRole(pool, reviewer, "reviewer");
});
afterAll(async () => {
  await store.setInvitationOnly(operator, false);
  await pool.query("delete from invitation where created_by = any($1)", [people]);
  await pool.query("delete from account where subject = any($1) or id = any($2)", [
    subjects,
    people,
  ]);
  await pool.end();
});

describe("US-ACC-05 · roles", () => {
  it("US-ACC-05 everyone reads only their own roles", async () => {
    expect(await store.roles(operator)).toEqual(["operator"]);
    expect(await store.roles(reviewer)).toEqual(["reviewer"]);
    expect(await store.roles(keeper)).toEqual([]);
  });
});

describe("US-ACC-05 · only the operator creates invitations (database enforced)", () => {
  it("US-ACC-05 the operator creates one; only the hash of the code is stored", async () => {
    const code = newCode();
    const created = await store.createInvitation(operator, { code, expiresAt: inOneDay() });
    const row = await pool.query<{ code_hash: Buffer; text: string }>(
      "select code_hash, i::text as text from invitation i where id = $1",
      [created.id],
    );
    expect(row.rows[0]?.code_hash.toString("hex")).toBe(sha256(code));
    expect(row.rows[0]?.text).not.toContain(code);
    expect(created.expiresAt).toMatch(/Z$/);
  });

  it.each([
    ["keeper", keeper],
    ["reviewer", reviewer],
  ])("US-ACC-05 %s cannot create one", async (_n, who) => {
    const before = (await pool.query("select count(*)::int as n from invitation")).rows[0].n;
    await expect(
      store.createInvitation(who, { code: newCode(), expiresAt: inOneDay() }),
    ).rejects.toThrow();
    expect((await pool.query("select count(*)::int as n from invitation")).rows[0].n).toBe(before);
  });

  it("US-ACC-05 the application role has no right on the tables themselves (not even the operator)", async () => {
    for (const table of ["invitation", "access_setting"]) {
      await expect(
        withAccount(pool, operator, (c) => c.query(`select * from ${table}`)),
      ).rejects.toThrow(/permission denied/);
      await expect(
        withAccount(pool, keeper, (c) => c.query(`delete from ${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("US-ACC-05 refuses an expiry in the past or more than 31 days ahead", async () => {
    await expect(
      store.createInvitation(operator, {
        code: newCode(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toThrow();
    await expect(
      store.createInvitation(operator, {
        code: newCode(),
        expiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
      }),
    ).rejects.toThrow();
  });

  it("US-ACC-05 refuses a code that is not 24 characters of the code alphabet", async () => {
    await expect(
      store.createInvitation(operator, { code: "short", expiresAt: inOneDay() }),
    ).rejects.toThrow();
  });
});

describe("US-ACC-05 · registration uses up a code exactly once", () => {
  it("US-ACC-05 a valid code creates the account and is used up", async () => {
    const code = await issue();
    const s = subject();
    expect(await store.register(s, code)).toBe("registered");
    expect(await accountsOf(s)).toBe(1);
    const other = subject();
    expect(await store.register(other, code)).toBe("invalid");
    expect(await accountsOf(other)).toBe(0);
  });

  it("US-ACC-05 an unknown code is invalid and creates no account", async () => {
    const s = subject();
    expect(await store.register(s, newCode())).toBe("invalid");
    expect(await accountsOf(s)).toBe(0);
  });

  it("US-ACC-05 an expired code is invalid, and says nothing different from an unknown one", async () => {
    const code = newCode();
    await pool.query(
      `insert into invitation (code_hash, created_by, created_at, expires_at)
       values (sha256(convert_to($1, 'UTF8')), $2, now() - interval '2 days', now() - interval '1 day')`,
      [code, operator],
    );
    const s = subject();
    expect(await store.register(s, code)).toBe("invalid");
    expect(await accountsOf(s)).toBe(0);
  });

  it("US-ACC-05 a code that expires at the moment of redeeming does not work", async () => {
    const code = newCode();
    await pool.query(
      `insert into invitation (code_hash, created_by, created_at, expires_at)
       values (sha256(convert_to($1, 'UTF8')), $2, now() - interval '1 second', now())`,
      [code, operator],
    );
    expect(await store.register(subject(), code)).toBe("invalid");
  });

  it("US-ACC-05 twenty concurrent registrations with one code: exactly one account, the code used once", async () => {
    const code = await issue();
    const names = Array.from({ length: 20 }, subject);
    const outcomes = await Promise.all(names.map((s) => store.register(s, code)));
    expect(outcomes.filter((o) => o === "registered")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "invalid")).toHaveLength(19);
    const created = (
      await pool.query("select count(*)::int as n from account where subject = any($1)", [names])
    ).rows[0].n;
    expect(created).toBe(1);
  });

  it("US-ACC-05 an existing account keeps the code unused", async () => {
    const code = await issue();
    const old = subject();
    expect(await store.register(old, await issue())).toBe("registered");
    expect(await store.register(old, code)).toBe("existing");
    expect(await store.register(subject(), code)).toBe("registered");
  });

  it("US-ACC-05 two concurrent first registrations of one subject with two codes use up at most one code", async () => {
    const [a, b] = [await issue(), await issue()];
    const s = subject();
    const outcomes = await Promise.all([store.register(s, a), store.register(s, b)]);
    expect(await accountsOf(s)).toBe(1);
    expect(outcomes.filter((o) => o === "registered")).toHaveLength(1);
    const unused = (
      await pool.query(
        "select count(*)::int as n from invitation where created_by = $1 and redeemed_at is null and code_hash = any($2)",
        [operator, [Buffer.from(sha256(a), "hex"), Buffer.from(sha256(b), "hex")]],
      )
    ).rows[0].n;
    expect(unused).toBe(1);
  });

  it("US-ACC-05 refuses an empty subject and rolls back on a database error", async () => {
    const code = await issue();
    await expect(store.register("  ", code)).rejects.toThrow("Subject missing");
    await expect(store.register("bad\u0000subject", code)).rejects.toThrow();
    expect(await store.register(subject(), code)).toBe("registered");
  });

  it("US-ACC-05 the code cannot be redeemed through the database without a verified subject", async () => {
    const code = await issue();
    await expect(
      withAccount(pool, keeper, (c) => c.query("select redeem_invitation($1)", [code])),
    ).rejects.toThrow();
    expect(await store.register(subject(), code)).toBe("registered");
  });
});

describe("US-ACC-05 · registration mode", () => {
  it("US-ACC-05 is off by default; only the operator switches it", async () => {
    expect(await admitAccount(pool, subject())).toEqual(expect.any(String));
    await expect(store.setInvitationOnly(keeper, true)).rejects.toThrow();
    await expect(store.setInvitationOnly(reviewer, true)).rejects.toThrow();
    expect((await store.overview(operator, 30)).invitationOnly).toBe(false);
  });

  it("US-ACC-05 switched on: known subjects sign in, new ones are not admitted and nothing is created", async () => {
    const known = await admitAccount(pool, subject());
    await store.setInvitationOnly(operator, true);
    try {
      expect(await admitAccount(pool, subjects[subjects.length - 1] as string)).toBe(known);
      const fresh = subject();
      expect(await admitAccount(pool, fresh)).toBeNull();
      expect(await accountsOf(fresh)).toBe(0);
      expect((await store.overview(operator, 30)).invitationOnly).toBe(true);
      expect(await store.register(fresh, await issue())).toBe("registered");
      expect(await admitAccount(pool, fresh)).toEqual(expect.any(String));
    } finally {
      await store.setInvitationOnly(operator, false);
    }
  });

  it("US-ACC-05 the mode can be forced for a request (tests of the API)", async () => {
    expect(await admitAccount(pool, subject(), { invitationOnly: true })).toBeNull();
  });
});

describe("US-ACC-05 · operator overview: counts, no content", () => {
  it("US-ACC-05 counts accounts and active accounts", async () => {
    const before = await store.overview(operator, 30);
    const s = subject();
    await store.register(s, await issue());
    const id = (await pool.query<{ id: string }>("select id from account where subject = $1", [s]))
      .rows[0]?.id as string;
    await withAccount(pool, id, (c) =>
      c.query(
        "insert into account_data (account_id, email, last_active_at) values ($1, 'a@example.test', now())",
        [id],
      ),
    );
    const after = await store.overview(operator, 30);
    expect(after.accounts).toBe(before.accounts + 1);
    expect(after.activeAccounts).toBe(before.activeAccounts + 1);
    await pool.query(
      "update account_data set last_active_at = now() - interval '31 days' where account_id = $1",
      [id],
    );
    expect((await store.overview(operator, 30)).activeAccounts).toBe(before.activeAccounts);
  });

  it("US-ACC-05 lists the invitations with their state, never a code", async () => {
    const open = await issue();
    const used = await issue();
    await store.register(subject(), used);
    const list = (await store.overview(operator, 30)).invitations;
    expect(list.filter((i) => i.status === "redeemed").length).toBeGreaterThanOrEqual(1);
    expect(list.filter((i) => i.status === "open").length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(list);
    expect(text).not.toContain(open);
    expect(text).not.toContain(used);
    expect(text).not.toContain(sha256(open));
  });

  it.each([
    ["keeper", keeper],
    ["reviewer", reviewer],
  ])("US-ACC-05 %s cannot read the overview", async (_n, who) => {
    await expect(store.overview(who, 30)).rejects.toThrow();
  });

  it("US-ACC-05 the operator role reaches no content of other accounts (P-05)", async () => {
    await withAccount(pool, keeper, (c) =>
      c.query("insert into account_data (account_id, email) values ($1, 'keeper@example.test')", [
        keeper,
      ]),
    );
    // Every table with an account id, except the review cases that reviewers read by design (US-BES-10).
    const tables = (await tenantsTables(pool)).filter(
      (t) => t.name !== "account" && t.name !== "review_case",
    );
    expect(tables.map((t) => t.name)).toContain("account_data");
    const foreignRows = await withAccount(pool, operator, async (c) => {
      let n = 0;
      for (const t of tables)
        n +=
          (await c.query(`select 1 from "${t.name}" where "${t.id}" <> $1`, [operator])).rowCount ??
          0;
      return n;
    });
    expect(foreignRows).toBe(0);
  });

  it("US-ACC-05 no row rule anywhere is opened by the operator role", async () => {
    const rules = await pool.query(
      `select polrelid::regclass::text as tbl from pg_policy
        where coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%is_operator%'`,
    );
    expect(rules.rows).toEqual([]);
  });
});

describe("US-ACC-05 · schema rules", () => {
  it("US-ACC-05 the new tables break no tenant or module rule", async () => {
    expect(await findSchemaViolations(pool)).toEqual([]);
  });
});
