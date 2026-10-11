import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithTimeZone } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { AiLogPostgres, ConnectionsPostgres } from "./index.ts";

// US-KI-02: the log of AI actions against real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool;
const accounts: string[] = [];
const now = new Date("2026-10-10T08:00:00.000Z");

const newAccount = async (): Promise<string> => {
  const id = randomUUID();
  accounts.push(id);
  await createAccountWithTimeZone(pool, id, null);
  return id;
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [accounts]);
  await Promise.all([pool.end(), admin.end()]);
});

describe("US-KI-02 log of AI actions", () => {
  it("US-KI-02 records and lists newest first with the client name, only for the own account (KI-R6)", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    const connections = new ConnectionsPostgres(pool);
    const log = new AiLogPostgres(pool);
    const c = await connections.create(
      anna,
      { clientId: "x", clientName: "Claude", rights: "read" },
      now,
    );
    await log.record(anna, { connectionId: c.id, operation: "status", effect: "one" }, now);
    await log.record(
      anna,
      { connectionId: c.id, operation: "status", effect: "two" },
      new Date(now.getTime() + 1000),
    );
    const rows = await log.list(anna, 10);
    expect(rows.map((r) => r.effect)).toEqual(["two", "one"]);
    expect(rows[0]).toMatchObject({ clientName: "Claude", operation: "status", undoneAt: null });
    expect(await log.list(ben, 10)).toEqual([]);
  });

  it("US-KI-02 refuses an entry for a connection of another account", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    const c = await new ConnectionsPostgres(pool).create(
      anna,
      { clientId: "y", clientName: "C", rights: "read" },
      now,
    );
    await expect(
      new AiLogPostgres(pool).record(
        ben,
        { connectionId: c.id, operation: "status", effect: "x" },
        now,
      ),
    ).rejects.toThrow();
  });
});
