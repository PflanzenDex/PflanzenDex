import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithTimeZone } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { ConnectionsPostgres } from "./index.ts";

// US-KI-07: connections of AI clients against real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool;
let store: ConnectionsPostgres;
const accounts: string[] = [];
const now = new Date("2026-10-10T08:00:00.000Z");
const client = {
  clientId: "https://claude.ai/client",
  clientName: "Claude",
  rights: "drafts" as const,
};

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
  store = new ConnectionsPostgres(pool);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [accounts]);
  await Promise.all([pool.end(), admin.end()]);
});

describe("US-KI-07 connections in the database", () => {
  it("US-KI-07 creates, finds, touches and lists a connection with its times", async () => {
    const anna = await newAccount();
    const made = await store.create(anna, client, now);
    expect(made).toMatchObject({
      ...client,
      requestedRights: null,
      lastUse: null,
      revokedAt: null,
    });
    expect(made.createdAt).toBe(now.toISOString());
    const later = new Date("2026-10-10T09:00:00.000Z");
    await store.touch(anna, made.id, later, "write");
    expect(await store.latest(anna, client.clientId)).toMatchObject({
      id: made.id,
      lastUse: later.toISOString(),
      requestedRights: "write",
    });
    expect(await store.list(anna)).toHaveLength(1);
  });

  it("US-KI-07 a repeated first call keeps one active connection", async () => {
    const anna = await newAccount();
    const [a, b] = await Promise.all([
      store.create(anna, client, now),
      store.create(anna, client, now),
    ]);
    expect(a.id).toBe(b.id);
    expect(await store.list(anna)).toHaveLength(1);
  });

  it("US-KI-07 setting the right clears a request that it covers and keeps a higher one", async () => {
    const anna = await newAccount();
    const made = await store.create(anna, client, now);
    await store.touch(anna, made.id, now, "write");
    expect((await store.setRights(anna, made.id, "drafts"))?.requestedRights).toBe("write");
    expect(await store.setRights(anna, made.id, "write")).toMatchObject({
      rights: "write",
      requestedRights: null,
    });
  });

  it("US-KI-07 a revoked connection stays as history, blocks the client and allows no more changes", async () => {
    const anna = await newAccount();
    const made = await store.create(anna, client, now);
    expect(await store.revoke(anna, made.id, now)).toBe("revoked");
    expect(await store.revoke(anna, made.id, now)).toBe("already");
    expect((await store.latest(anna, client.clientId))?.revokedAt).toBe(now.toISOString());
    expect(await store.setRights(anna, made.id, "write")).toBeNull();
    const again = await store.create(anna, client, new Date("2026-10-11T08:00:00.000Z"));
    expect(again.id).not.toBe(made.id);
    expect(await store.list(anna)).toHaveLength(2);
  });

  it("US-KI-07 a connection never leaves its account: others neither see, change nor revoke it (KI-R6, FR-KI-04)", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    const made = await store.create(anna, client, now);
    expect(await store.list(ben)).toEqual([]);
    expect(await store.latest(ben, client.clientId)).toBeNull();
    expect(await store.setRights(ben, made.id, "write")).toBeNull();
    expect(await store.revoke(ben, made.id, now)).toBe("unknown");
    expect(await store.latest(anna, client.clientId)).toMatchObject({
      rights: "drafts",
      revokedAt: null,
    });
  });
});
