import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithTimeZone } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { ConnectionsPostgres, DraftsPostgres, TasksPostgres } from "./index.ts";

// US-KI-08: tasks against real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool;
const accounts: string[] = [];
const now = new Date("2026-10-10T08:00:00.000Z");
const task = (reference = "Aloe vera") => ({
  type: "species_profile",
  reference,
  label: reference,
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

describe("US-KI-08 tasks in the database", () => {
  it("US-KI-08 merges open tasks with the same type and reference and lists them", async () => {
    const { id } = await setup();
    const store = new TasksPostgres(pool);
    const a = await store.create(id, task(), now);
    const b = await store.create(id, task(), now);
    expect([a.created, b.created, a.task.id === b.task.id]).toEqual([true, false, true]);
    expect((await store.create(id, task("Haworthia"), now)).created).toBe(true);
    expect(await store.list(id, now)).toHaveLength(2);
  });

  it("US-KI-08 moves open to in progress to done with connection and draft; closed tasks do not move again", async () => {
    const { id, c } = await setup();
    const store = new TasksPostgres(pool);
    const { task: t } = await store.create(id, task(), now);
    expect(
      await store.transition(id, t.id, { from: ["open"], to: "in_progress", connectionId: c }, now),
    ).toMatchObject({ status: "in_progress", clientName: "Claude" });
    expect(await store.transition(id, t.id, { from: ["open"], to: "in_progress" }, now)).toBeNull();
    const { draft } = await new DraftsPostgres(pool).create(
      id,
      {
        connectionId: c,
        type: "species",
        reference: null,
        content: { n: 1 },
        contentKey: "{}",
        source: "s",
      },
      now,
    );
    const done = await store.transition(
      id,
      t.id,
      { from: ["open", "in_progress"], to: "done", draftId: draft.id },
      now,
    );
    expect(done).toMatchObject({ status: "done", draftId: draft.id, connectionId: c });
    expect(
      await store.transition(id, t.id, { from: ["open", "in_progress"], to: "declined" }, now),
    ).toBeNull();
  });

  it("US-KI-08 an open task expires after 14 days, stays viewable and no longer blocks a new one", async () => {
    const { id } = await setup();
    const store = new TasksPostgres(pool);
    const { task: t } = await store.create(id, task(), now);
    const later = new Date(now.getTime() + 15 * 86400000);
    expect((await store.find(id, t.id, later))?.status).toBe("expired");
    expect(await store.transition(id, t.id, { from: ["open"], to: "declined" }, later)).toBeNull();
    const again = await store.create(id, task(), later);
    expect(again.created).toBe(true);
    expect((await store.find(id, t.id, later))?.status).toBe("expired");
  });

  it("US-KI-08 KI-R6 a task never leaves its account", async () => {
    const [a, b] = [await setup(), await setup()];
    const store = new TasksPostgres(pool);
    const { task: t } = await store.create(a.id, task(), now);
    expect(await store.list(b.id, now)).toEqual([]);
    expect(await store.find(b.id, t.id, now)).toBeNull();
    expect(await store.transition(b.id, t.id, { from: ["open"], to: "declined" }, now)).toBeNull();
    expect((await store.create(b.id, task(), now)).created).toBe(true);
  });
});
