import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithTimeZone } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { ConnectionsPostgres, DraftsPostgres } from "./index.ts";

// US-KI-09: drafts against real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool;
const accounts: string[] = [];
const now = new Date("2026-10-10T08:00:00.000Z");
const draft = (connectionId: string, name = "Aloe") => ({
  connectionId,
  type: "wish",
  reference: null,
  content: { name },
  contentKey: JSON.stringify({ name }),
  source: "https://example.test/s",
});

const setup = async () => {
  const id = randomUUID();
  accounts.push(id);
  await createAccountWithTimeZone(pool, id, null);
  const c = await new ConnectionsPostgres(pool).create(
    id,
    { clientId: "x", clientName: "Claude", rights: "drafts" },
    now,
  );
  return { id, c: c.id };
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

describe("US-KI-09 drafts in the database", () => {
  it("US-KI-09 stores, lists with the client name and keeps one open draft per content", async () => {
    const { id, c } = await setup();
    const store = new DraftsPostgres(pool);
    const a = await store.create(id, draft(c), now);
    const b = await store.create(id, draft(c), now);
    expect([a.created, b.created, a.draft.id === b.draft.id]).toEqual([true, false, true]);
    expect((await store.list(id, now))[0]).toMatchObject({
      clientName: "Claude",
      status: "open",
      content: { name: "Aloe" },
    });
  });

  it("US-KI-09 adopt, revert and discard move only open drafts; expired ones are derived and closed", async () => {
    const { id, c } = await setup();
    const store = new DraftsPostgres(pool);
    const { draft: d } = await store.create(id, draft(c), now);
    expect(await store.decide(id, d.id, "adopted", now)).toBe(true);
    expect(await store.decide(id, d.id, "discarded", now)).toBe(false);
    expect(await store.decide(id, d.id, "open", now)).toBe(true);
    const later = new Date(now.getTime() + 15 * 86400000);
    expect((await store.find(id, d.id, later))?.status).toBe("expired");
    expect(await store.decide(id, d.id, "discarded", later)).toBe(false);
    expect(await store.decide(id, d.id, "discarded", now)).toBe(true);
    expect((await store.find(id, d.id, now))?.status).toBe("discarded");
  });

  it("US-KI-09 KI-R6 a draft never leaves its account and cannot point at a foreign connection", async () => {
    const [a, b] = [await setup(), await setup()];
    const store = new DraftsPostgres(pool);
    const { draft: d } = await store.create(a.id, draft(a.c), now);
    expect(await store.list(b.id, now)).toEqual([]);
    expect(await store.find(b.id, d.id, now)).toBeNull();
    expect(await store.decide(b.id, d.id, "discarded", now)).toBe(false);
    await expect(store.create(b.id, draft(a.c, "Other"), now)).rejects.toThrow();
  });
});
