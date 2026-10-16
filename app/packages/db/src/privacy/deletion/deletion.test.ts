import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fillAccountWithFixtures,
  migrate,
  openFixturePool,
  openOwnerPool,
  tenantsTables,
} from "../../kernel/index.ts";
import { FIXTURES, createFixtureSpeciesAt } from "../../fixtures.ts";
import {
  befriend,
  catalogContributions,
  createCatalogContributions,
  createSwap,
  friendshipsOf,
  removeCatalogContributions,
  swapOf,
} from "../../erasure-fixtures.ts";
import { AccountDeletionPostgres } from "./deletion.ts";

// US-ACC-04: deleting an account removes every row of it, keeps what belongs to others, and can be repeated.
let pool: Pool;
let admin: Pool;
let deletions: AccountDeletionPostgres;
const gone = randomUUID();
const stays = randomUUID();
const partner = randomUUID();
const shared = randomUUID(); // species of `gone` that became part of the shared catalog
const proposal = randomUUID(); // species of `gone` that only `gone` can see
const leaving = randomUUID(); // deletes the account; `partner` is a confirmed friend with two swaps
const done = randomUUID(); // swap id of a completed swap
const running = randomUUID(); // swap id of a running swap
const NOW = new Date();
const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function counts(account: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await tenantsTables(admin)) {
    const r = await admin.query(
      `select count(*)::int as n from ${q(t.name)} where ${q(t.id)} = $1`,
      [account],
    );
    out[t.name] = r.rows[0].n;
  }
  return out;
}

const makeDue = (account: string) =>
  admin.query(
    `update account_deletion set requested_at = now() - interval '8 days', due_at = now() - interval '1 day'
      where account_id = $1`,
    [account],
  );

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  deletions = new AccountDeletionPostgres(pool);
  await migrate(pool);
  await createFixtureSpeciesAt();
  for (const id of [gone, stays, partner, leaving])
    await admin.query("insert into account (id) values ($1)", [id]);
  await fillAccountWithFixtures(pool, FIXTURES, gone);
  await fillAccountWithFixtures(pool, FIXTURES, stays);
  await createCatalogContributions(admin, gone, { shared, proposal });
});
afterAll(async () => {
  await removeCatalogContributions(admin, [shared, proposal], [gone, stays, partner, leaving]);
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 deleting the account", () => {
  it("US-ACC-04 does nothing without a request, and nothing before the grace period ends", async () => {
    expect(await deletions.erase(gone, NOW)).toBeNull();
    await deletions.request(gone, new Date(NOW.getTime() + 7 * 86_400_000));
    expect(await deletions.erase(gone, NOW)).toBeNull();
    // Even a direct call of the function refuses before the deadline.
    await expect(
      pool.connect().then(async (c) => {
        try {
          await c.query("begin");
          await c.query("set local role pflanzendex_app");
          await c.query("select set_config('app.account_id', $1, true)", [gone]);
          await c.query("select * from erase_account()");
        } finally {
          await c.query("rollback");
          c.release();
        }
      }),
    ).rejects.toThrow("grace period");
    expect((await counts(gone))["account"]).toBe(1);
  });

  it("US-ACC-04 a request is kept once made, and the keeper can withdraw it", async () => {
    const first = await deletions.find(gone);
    const again = await deletions.request(gone, new Date(NOW.getTime() + 99 * 86_400_000));
    expect(again.dueAt).toEqual(first?.dueAt);
    expect(await deletions.cancel(gone)).toBe(true);
    expect(await deletions.find(gone)).toBeNull();
    expect(await deletions.cancel(gone)).toBe(false);
  });

  it("US-ACC-04 leaves no row of the account in any table with an account id, and nothing of another account changes", async () => {
    await deletions.request(gone, new Date(NOW.getTime() + 7 * 86_400_000));
    await makeDue(gone);
    const before = await counts(stays);
    const result = await deletions.erase(gone, NOW);
    expect(result).toEqual({ subject: null });
    const left = Object.entries(await counts(gone)).filter(([, n]) => n > 0);
    expect(left).toEqual([]);
    expect(await counts(stays)).toEqual(before);
  });

  it("US-ACC-04 repeating the deletion finds nothing to do and changes nothing", async () => {
    expect(await deletions.erase(gone, NOW)).toBeNull();
  });

  it("US-ACC-04 writes an anonymous log row without any account id", async () => {
    const r = await admin.query("select * from deletion_log order by completed_at desc limit 1");
    expect(Object.keys(r.rows[0])).toEqual(
      expect.not.arrayContaining(["account_id", "email", "display_name"]),
    );
  });

  it("US-ACC-04 the shared catalog keeps an approved species without its creator, and a private proposal is gone", async () => {
    expect(await catalogContributions(admin, { shared, proposal })).toEqual({
      sharedCase: [{ account_id: null, status: "curated" }],
      sharedSpecies: 1,
      proposalSpecies: 0,
      proposalCase: 0,
    });
  });
});

describe("US-ACC-04 what a deletion leaves with the partner", () => {
  beforeAll(async () => {
    const peter = { id: leaving, name: "Peter" };
    const lena = { id: partner, name: "Lena" };
    await befriend(admin, peter, lena);
    await createSwap(admin, { swapId: done, status: "handed_over" }, lena, peter);
    await createSwap(admin, { swapId: running, status: "requested" }, lena, peter);
    await deletions.request(leaving, new Date(NOW.getTime() + 7 * 86_400_000));
    await makeDue(leaving);
    expect(await deletions.erase(leaving, NOW)).not.toBeNull();
  });

  it("US-ACC-04 the partner no longer has a friendship with the deleted account", async () => {
    expect(await friendshipsOf(admin, partner)).toBe(0);
  });

  it("US-ACC-04 a completed swap stays with the partner with the stored name and no connection", async () => {
    expect(await swapOf(admin, partner, done)).toEqual([
      { other_id: null, other_name: "Peter", status: "handed_over", cause: null },
    ]);
  });

  it("US-ACC-04 a running swap is canceled with the cause account_deleted, visible to the partner (P-10)", async () => {
    expect(await swapOf(admin, partner, running)).toEqual([
      { other_id: null, other_name: "Peter", status: "canceled", cause: "account_deleted" },
    ]);
  });
});
