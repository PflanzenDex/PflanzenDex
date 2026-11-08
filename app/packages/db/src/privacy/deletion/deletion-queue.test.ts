import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { assignRole, createAccountWithName } from "../../fixtures.ts";
import { AccountDeletionPostgres } from "./deletion.ts";
import { DeletionQueuePostgres } from "./deletion-queue.ts";

// US-ACC-04, US-DEV-03 (issue 1673): the deadline view and the identity removals the operator closes. Real PostgreSQL.
let pool: Pool;
let admin: Pool;
let deletions: AccountDeletionPostgres;
let queue: DeletionQueuePostgres;
const operator = randomUUID();
const keeper = randomUUID();
const requesting = randomUUID();
const withoutSubject = randomUUID();
const subject = `acc4q-${randomUUID()}`;
const DAY = 24 * 60 * 60 * 1000;
let entry: string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  deletions = new AccountDeletionPostgres(pool);
  queue = new DeletionQueuePostgres(pool);
  for (const id of [operator, keeper, requesting, withoutSubject]) {
    await createAccountWithName(pool, id, `Test ${id.slice(0, 4)}`);
  }
  await assignRole(pool, operator, "operator");
  await admin.query("update account set subject = $2 where id = $1", [requesting, subject]);
  await deletions.request(requesting, new Date(Date.now() + 7 * DAY));
  // A finished deletion whose identity is still open (the log is written by the job, here directly).
  const r = await pool.query<{ id: string }>(
    `insert into deletion_log (requested_at, completed_at, subject)
     values (now() - interval '3 days', now() - interval '1 day', $1) returning id`,
    [subject],
  );
  entry = r.rows[0]?.id as string;
});
afterAll(async () => {
  await admin.query("delete from deletion_log where subject = $1", [subject]);
  await admin.query("delete from account where id = any($1)", [
    [operator, keeper, requesting, withoutSubject],
  ]);
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 the deadline view and the identity removals", () => {
  it("US-ACC-04 the owner reads every open request for the deadline check, without any account id", async () => {
    const rows = await queue.openItems();
    expect(rows.filter((row) => row.kind === "request").length).toBeGreaterThanOrEqual(1);
    const identity = rows.find((row) => row.entryId === entry);
    expect(identity).toMatchObject({ kind: "identity", subject, completedAt: expect.any(Date) });
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual([
        "completedAt",
        "entryId",
        "kind",
        "requestedAt",
        "subject",
      ]);
  });

  it("US-ACC-04 the operator reads the open items, and a plant keeper is refused by the database", async () => {
    const rows = await queue.queue(operator);
    expect(rows).toContainEqual(expect.objectContaining({ entryId: entry, subject }));
    await expect(queue.queue(keeper)).rejects.toMatchObject({ code: "42501" });
  });

  it("US-ACC-04 the application role cannot call the owner's deadline function", async () => {
    await expect(
      withAccount(pool, operator, (c) => c.query("select * from deletion_deadline_rows()")),
    ).rejects.toThrow();
  });

  it("US-ACC-04 marking an identity removal closes the entry; a repeat answers already; an unknown entry answers unknown", async () => {
    await expect(queue.markIdentityRemoved(keeper, entry)).rejects.toMatchObject({ code: "42501" });
    expect(await queue.queue(operator)).toContainEqual(expect.objectContaining({ entryId: entry }));
    expect(await queue.markIdentityRemoved(operator, entry)).toBe("marked");
    expect(await queue.markIdentityRemoved(operator, entry)).toBe("already");
    expect(await queue.markIdentityRemoved(operator, randomUUID())).toBe("unknown");
    expect(await queue.queue(operator)).not.toContainEqual(
      expect.objectContaining({ entryId: entry }),
    );
    const kept = await admin.query(
      "select subject, identity_removed_at from deletion_log where id = $1",
      [entry],
    );
    expect(kept.rows[0]).toEqual({ subject: null, identity_removed_at: expect.any(Date) });
  });

  it("US-ACC-04 the account reads its own subject before the erase, and nothing for an account without one", async () => {
    expect(await deletions.subjectOf(requesting)).toBe(subject);
    expect(await deletions.subjectOf(withoutSubject)).toBeNull();
  });
});
