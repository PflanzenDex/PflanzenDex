import { randomUUID } from "node:crypto";
import {
  REMINDER_JOB_TYPE,
  scheduleReminders,
  sendRemindersHandler,
  type JobRow,
  type Occasion,
  type ReminderMessage,
} from "@pflanzendex/core";
import {
  ChannelsPostgres,
  JobsPostgres,
  RemindersPostgres,
  migrate,
  openFixturePool,
  openOwnerPool,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import { StubReminderChannel } from "./runtime";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-MON-01, US-MON-08: reminders, settings, push subscriptions and the daily job (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: account ids and cleanup (QG-D1)
const subA = `mon-${randomUUID()}`;
const subB = `mon-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const accountId = async (sub: string) =>
  (await admin.query<{ id: string }>("select id from account where subject = $1", [sub])).rows[0]
    ?.id as string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  // The first request of a token creates the account; the profile gives it a time zone.
  for (const sub of [subA, subB])
    await call(sub, "PUT", "/account/profile", {
      displayName: sub.slice(0, 12),
      timeZone: "Europe/Berlin",
      everythingPrivate: false,
      noRecommendations: false,
      notifications: {},
      replenishBuffer: null,
    });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

const settings = {
  sendTime: "07:30",
  quietFrom: "22:00",
  quietTo: "06:00",
  paused: { treatment: "2026-10-17" },
  measurementDays: 14,
};
const sub = (n: number) => ({
  endpoint: `https://push.example/${randomUUID()}-${n}`,
  p256dh: "key",
  auth: "auth",
});

describe("US-MON-08 reminder settings through the API", () => {
  it("US-MON-08 answers 401 without a token", async () => {
    for (const [method, path] of [
      ["GET", "/reminders"],
      ["GET", "/reminders/settings"],
      ["GET", "/reminders/subscriptions"],
      ["PUT", "/reminders/settings"],
      ["POST", "/reminders/subscriptions"],
      ["DELETE", "/reminders/subscriptions"],
    ] as const)
      expect((await call(null, method, path, {})).status).toBe(401);
  });

  it("US-MON-08 answers the defaults, saves the settings and keeps them apart per account", async () => {
    expect((await call(subA, "GET", "/reminders/settings")).body).toMatchObject({
      sendTime: "08:00",
      measurementDays: 30,
    });
    expect((await call(subA, "PUT", "/reminders/settings", settings)).status).toBe(200);
    expect((await call(subA, "GET", "/reminders/settings")).body).toEqual(settings);
    expect((await call(subB, "GET", "/reminders/settings")).body["sendTime"]).toBe("08:00");
  });

  it("US-MON-08 refuses invalid settings with 400 input.invalid and changes nothing", async () => {
    const bad = await call(subA, "PUT", "/reminders/settings", { ...settings, sendTime: "25:61" });
    expect(bad).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect((await call(subA, "GET", "/reminders/settings")).body["sendTime"]).toBe("07:30");
  });

  it("US-MON-08 registers and removes a push subscription, refuses a non-https endpoint", async () => {
    const s = sub(1);
    expect((await call(subA, "POST", "/reminders/subscriptions", s)).status).toBe(201);
    const bad = await call(subA, "POST", "/reminders/subscriptions", {
      ...s,
      endpoint: "http://push.example/x",
    });
    expect(bad).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    const channels = new ChannelsPostgres(pool);
    // The list shows the endpoints only, never the keys, and only the own ones (US-MON-08, P-04).
    expect((await call(subA, "GET", "/reminders/subscriptions")).body).toEqual({
      subscriptions: [{ endpoint: s.endpoint }],
    });
    expect((await call(subB, "GET", "/reminders/subscriptions")).body).toEqual({
      subscriptions: [],
    });
    expect(await channels.subscriptions(await accountId(subA))).toHaveLength(1);
    expect(await channels.subscriptions(await accountId(subB))).toEqual([]);
    expect(
      await call(subA, "DELETE", "/reminders/subscriptions", { endpoint: s.endpoint }),
    ).toMatchObject({
      status: 200,
      body: { removed: true },
    });
  });

  it("US-MON-08 refuses the 11th subscription with 409 monitoring.subscription_limit", async () => {
    for (let i = 0; i < 10; i++)
      expect((await call(subB, "POST", "/reminders/subscriptions", sub(i))).status).toBe(201);
    expect(await call(subB, "POST", "/reminders/subscriptions", sub(10))).toMatchObject({
      status: 409,
      body: { error: { code: "monitoring.subscription_limit" } },
    });
  });
});

describe("US-MON-01 the daily job against the database", () => {
  const item: Occasion = {
    id: "measurement:1",
    occasion: "measurement",
    text: "„Ficus“ wurde seit mehr als 30 Tagen nicht gemessen.",
    nextAction: "Miss das Exemplar und trage die Messung ein.",
  };
  const job = (userId: string, date: string, attempts = 1): JobRow => ({
    id: randomUUID(),
    type: REMINDER_JOB_TYPE,
    dedupeKey: `reminders:${userId}:${date}`,
    payload: { userId, date, timeZone: "Europe/Berlin" },
    status: "running",
    attempts,
    maxAttempts: 3,
    runAt: new Date(),
    expiresAt: null,
    lastError: null,
  });
  const sent: ReminderMessage[] = [];
  const handler = (list: readonly Occasion[], failing = false) =>
    sendRemindersHandler({
      reminders: new RemindersPostgres(pool),
      channels: new ChannelsPostgres(pool),
      source: { occasions: async () => list },
      channel: {
        send: async (_userId, message) => {
          if (failing) throw new Error("push service down");
          sent.push(message);
        },
      },
    });

  it("US-MON-01 stores the bundle in the inbox and sends once, however often the job runs", async () => {
    const id = await accountId(subA);
    await new ChannelsPostgres(pool).add(id, sub(50));
    await handler([item])(job(id, "2026-10-10"), new Date());
    await handler([item])(job(id, "2026-10-10", 2), new Date());
    expect(sent).toHaveLength(1);
    const inbox = (await call(subA, "GET", "/reminders")).body["reminders"] as {
      localDate: string;
      status: string;
      items: { id: string }[];
    }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ localDate: "2026-10-10", status: "delivered" });
    expect(inbox[0]?.items.map((i) => i.id)).toEqual(["measurement:1"]);
  });

  it("US-MON-01 without a push subscription the reminder stays in the inbox and nothing is sent (P-10)", async () => {
    const id = await accountId(subB);
    await admin.query("delete from delivery_channel where account_id = $1", [id]);
    const before = sent.length;
    await handler([item])(job(id, "2026-10-09"), new Date());
    expect(sent).toHaveLength(before);
    const inbox = (await call(subB, "GET", "/reminders")).body["reminders"] as { status: string }[];
    expect(inbox.map((r) => r.status)).toContain("in_app");
  });

  it("P-04 the inbox of another account stays empty", async () => {
    const own = (await call(subA, "GET", "/reminders")).body["reminders"] as {
      localDate: string;
    }[];
    expect(own.map((r) => r.localDate)).toEqual(["2026-10-10"]);
  });

  it("US-MON-01 a day without need for action leaves the inbox empty and sends nothing", async () => {
    const id = await accountId(subB);
    const before = sent.length;
    await handler([])(job(id, "2026-10-12"), new Date());
    expect(sent).toHaveLength(before);
    const inbox = (await call(subB, "GET", "/reminders")).body["reminders"] as {
      localDate: string;
    }[];
    expect(inbox.map((r) => r.localDate)).not.toContain("2026-10-12");
  });

  it("FR-MON-08 a failing channel is marked failed after the third attempt and stays visible in the inbox", async () => {
    const id = await accountId(subB);
    await new ChannelsPostgres(pool).add(id, sub(99));
    const run = handler([item], true);
    for (const attempt of [1, 2, 3])
      await expect(run(job(id, "2026-10-11", attempt), new Date())).rejects.toThrow("down");
    const [row] = (await call(subB, "GET", "/reminders")).body["reminders"] as {
      status: string;
      attempts: number;
      lastError: string;
    }[];
    expect(row).toMatchObject({ status: "failed", attempts: 3, lastError: "push service down" });
  });

  it("US-MON-01 the scheduler orders one job per account and day in the job queue, and no second one", async () => {
    const id = await accountId(subA);
    const dayAfter = new Date("2026-11-20T12:00:00Z");
    const deps = {
      roster: { accounts: async () => [{ userId: id, timeZone: "Europe/Berlin" }] },
      reminders: new RemindersPostgres(pool),
      queue: new JobsPostgres(pool),
    };
    expect(await scheduleReminders(deps, dayAfter)).toBe(1);
    expect(await scheduleReminders(deps, dayAfter)).toBe(0);
    const { rows } = await admin.query<{ n: string }>(
      "select count(*) as n from job where type = $1 and dedupe_key = $2 and status = 'queued'",
      [REMINDER_JOB_TYPE, `reminders:${id}:2026-11-20`],
    );
    expect(Number(rows[0]?.n)).toBe(1);
    await admin.query("delete from job where dedupe_key = $1", [`reminders:${id}:2026-11-20`]);
  });

  it("US-MON-01 the stub channel sends nothing out and says so in the log", async () => {
    const lines: string[] = [];
    await new StubReminderChannel((l) => lines.push(l)).send("anna", {
      title: "PflanzenDex",
      body: "1 Sache braucht heute dich.",
      items: [item],
    });
    expect(lines[0]).toContain("nothing sent");
  });
});
