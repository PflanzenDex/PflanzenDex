import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IdempotencyPostgres,
  migrate,
  openFixturePool,
  openOwnerPool,
  withAccount,
} from "./index.ts";

// US-QS-03, P-04: the repeat guard in PostgreSQL tells a conflict after the first write is done (with its saved
// result) from one while it still runs, and never shows another account's entry (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cleanup of the two test accounts: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

const s = (userId: string, key: string) => ({ userId, operation: "t.t", key });

describe("US-QS-03 the repeat guard in the database names a conflict", () => {
  it("US-QS-03 a key of a completed write with other input is a conflict that carries the saved result", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    await idem.complete(s(anna, key), { id: 1 });
    expect(await idem.begin(s(anna, key), "b")).toEqual({
      kind: "conflict",
      done: true,
      result: { id: 1 },
    });
  });

  it("US-QS-03 a key of a write that still runs with other input is running, not a conflict", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    expect(await idem.begin(s(anna, key), "b")).toEqual({ kind: "running" });
  });

  it("US-QS-03 P-04 another account with the same key is fresh, and its conflict carries only its own result", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    await idem.complete(s(anna, key), { owner: "anna" });
    expect(await idem.begin(s(ben, key), "b")).toEqual({ kind: "fresh" });
    await idem.complete(s(ben, key), { owner: "ben" });
    expect(await idem.begin(s(ben, key), "c")).toEqual({
      kind: "conflict",
      done: true,
      result: { owner: "ben" },
    });
  });

  it("US-QS-03 a released key is fresh again, whatever its input", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    await idem.discard(s(anna, key));
    expect(await idem.begin(s(anna, key), "b")).toEqual({ kind: "fresh" });
  });
});
