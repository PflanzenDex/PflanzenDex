import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithTimeZone } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { ChannelsPostgres, RemindersPostgres, RosterPostgres } from "./index.ts";

// US-MON-01, US-MON-08: reminders, settings and push subscriptions against real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool; // superuser: observation and cleanup across accounts (#294)
let reminders: RemindersPostgres;
let channels: ChannelsPostgres;
const accounts: string[] = [];

const newAccount = async (timeZone: string | null = null): Promise<string> => {
  const id = randomUUID();
  accounts.push(id);
  await createAccountWithTimeZone(pool, id, timeZone);
  return id;
};
const item = {
  id: "treatment:1",
  occasion: "treatment" as const,
  text: "Fällig.",
  nextAction: "Behandeln.",
};
const sub = (n: number) => ({
  endpoint: `https://push.example/${randomUUID()}-${n}`,
  p256dh: "key",
  auth: "auth",
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  reminders = new RemindersPostgres(pool);
  channels = new ChannelsPostgres(pool);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [accounts]);
  await Promise.all([pool.end(), admin.end()]);
});

describe("US-MON-08 reminder settings", () => {
  it("US-MON-08 answers the defaults until saved, then the saved values, per account", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    expect(await reminders.settings(anna)).toEqual({
      sendTime: "08:00",
      quietFrom: null,
      quietTo: null,
      paused: {},
      measurementDays: 30,
    });
    const saved = {
      sendTime: "07:30",
      quietFrom: "22:00",
      quietTo: "06:00",
      paused: { treatment: "2026-10-17" },
      measurementDays: 14,
    };
    expect(await reminders.saveSettings(anna, saved)).toEqual(saved);
    expect(await reminders.saveSettings(anna, saved)).toEqual(saved);
    expect(await reminders.settings(anna)).toEqual(saved);
    expect((await reminders.settings(ben)).sendTime).toBe("08:00");
  });

  it("US-MON-08 the database refuses a half quiet window and days outside 1 to 365", async () => {
    const anna = await newAccount();
    const base = {
      sendTime: "08:00",
      quietFrom: null,
      quietTo: null,
      paused: {},
      measurementDays: 30,
    };
    await expect(reminders.saveSettings(anna, { ...base, quietFrom: "22:00" })).rejects.toThrow();
    await expect(reminders.saveSettings(anna, { ...base, measurementDays: 0 })).rejects.toThrow();
  });
});

describe("US-MON-01 one reminder per account and local day", () => {
  it("FR-MON-02 a second create for the same day returns the stored row and changes nothing", async () => {
    const anna = await newAccount();
    const first = await reminders.create(anna, "2026-10-10", [item], "pending");
    const again = await reminders.create(anna, "2026-10-10", [], "none");
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.row).toMatchObject({
      id: first.row.id,
      status: "pending",
      localDate: "2026-10-10",
    });
    expect(again.row.items).toEqual([item]);
  });

  it("FR-MON-08 records the outcome of a delivery and lists newest first without the days with nothing due", async () => {
    const anna = await newAccount();
    const a = await reminders.create(anna, "2026-10-09", [item], "pending");
    await reminders.create(anna, "2026-10-10", [item], "in_app");
    await reminders.create(anna, "2026-10-11", [], "none");
    await reminders.settle(anna, a.row.id, { status: "failed", attempts: 3, error: "down" });
    const list = await reminders.list(anna, 10);
    expect(list.map((r) => r.localDate)).toEqual(["2026-10-10", "2026-10-09"]);
    expect(list[1]).toMatchObject({ status: "failed", attempts: 3, lastError: "down" });
    expect(await reminders.find(anna, "2026-10-12")).toBeNull();
  });

  it("P-04 an account sees and changes only its own reminders and settings", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    const own = await reminders.create(anna, "2026-10-10", [item], "in_app");
    expect(await reminders.list(ben, 10)).toEqual([]);
    expect(await reminders.find(ben, "2026-10-10")).toBeNull();
    await reminders.settle(ben, own.row.id, { status: "failed", attempts: 9, error: "x" });
    expect((await reminders.find(anna, "2026-10-10"))?.status).toBe("in_app");
  });
});

describe("US-MON-08 push subscriptions", () => {
  it("US-MON-08 adds once per endpoint, removes, and keeps the subscriptions of the account apart", async () => {
    const [anna, ben] = [await newAccount(), await newAccount()];
    const s = sub(1);
    expect(await channels.add(anna, s)).toBe("added");
    expect(await channels.add(anna, s)).toBe("known");
    expect(await channels.subscriptions(ben)).toEqual([]);
    expect(await channels.add(ben, s)).toBe("added");
    expect(await channels.remove(anna, s.endpoint)).toBe(true);
    expect(await channels.remove(anna, s.endpoint)).toBe(false);
    expect(await channels.subscriptions(anna)).toEqual([]);
    expect(await channels.subscriptions(ben)).toHaveLength(1);
  });

  it("US-MON-08 refuses the 11th subscription of an account", async () => {
    const anna = await newAccount();
    for (let i = 0; i < 10; i++) expect(await channels.add(anna, sub(i))).toBe("added");
    expect(await channels.add(anna, sub(10))).toBe("limit");
  });
});

describe("US-MON-01 the roster of the scheduler", () => {
  it("NFR-08 lists the accounts with a time zone and none without, only for the owner role", async () => {
    const [berlin, none] = [await newAccount("Europe/Berlin"), await newAccount(null)];
    const roster = await new RosterPostgres(pool).accounts();
    expect(roster).toContainEqual({ userId: berlin, timeZone: "Europe/Berlin" });
    expect(roster.map((r) => r.userId)).not.toContain(none);
    await expect(
      withAccount(pool, berlin, (c) => c.query("select * from reminder_accounts()")),
    ).rejects.toThrow();
  });
});
