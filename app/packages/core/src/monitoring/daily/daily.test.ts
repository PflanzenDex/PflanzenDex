import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "../../jobs/test-helpers";
import type { JobRow } from "../../jobs";
import {
  InMemoryChannels,
  InMemoryReminders,
  RecordingChannel,
  occasionsOf,
  rosterOf,
} from "../test-helpers";
import type { Occasion } from "../types";
import { REMINDER_JOB_TYPE, scheduleReminders, sendRemindersHandler } from "./daily";

const anna = "anna";
const treatment: Occasion = {
  id: "treatment:1",
  occasion: "treatment",
  text: "„Ficus“: gießen – heute fällig.",
  nextAction: "Behandle das Exemplar.",
};
const sub = { endpoint: "https://push.example/abc", p256dh: "k", auth: "a" };

const job = (attempts = 1, date = "2026-10-10"): JobRow => ({
  id: "j1",
  type: REMINDER_JOB_TYPE,
  dedupeKey: `reminders:${anna}:${date}`,
  payload: { userId: anna, date, timeZone: "Europe/Berlin" },
  status: "running",
  attempts,
  maxAttempts: 3,
  runAt: new Date("2026-10-10T06:00:00Z"),
  expiresAt: null,
  lastError: null,
});

function setup(list: readonly Occasion[] = [treatment]) {
  const reminders = new InMemoryReminders();
  const channels = new InMemoryChannels();
  const channel = new RecordingChannel();
  const run = sendRemindersHandler({ reminders, channels, channel, source: occasionsOf(list) });
  return { reminders, channels, channel, run };
}
const now = new Date("2026-10-10T06:00:00Z");

describe("US-MON-01 the daily check sends one bundled message, and only when needed", () => {
  it("US-MON-01 stores one bundle and hands it to the channel for a subscribed account", async () => {
    const t = setup([treatment, { ...treatment, id: "treatment:2" }]);
    await t.channels.add(anna, sub);
    await t.run(job(), now);
    expect(t.channel.sent).toHaveLength(1);
    expect(t.channel.sent[0]?.message.items).toHaveLength(2);
    expect(t.channel.sent[0]?.message.body).toBe("2 Sachen brauchen heute dich.");
    expect((await t.reminders.find(anna, "2026-10-10"))?.status).toBe("delivered");
  });

  it("US-MON-01 sends nothing without need for action, and records only that the day was checked", async () => {
    const t = setup([]);
    await t.channels.add(anna, sub);
    await t.run(job(), now);
    expect(t.channel.sent).toHaveLength(0);
    expect((await t.reminders.find(anna, "2026-10-10"))?.status).toBe("none");
    expect(await t.reminders.list(anna, 10)).toEqual([]);
  });

  it("US-MON-01 the same occasion is not reported twice on the same day, also on a rerun of the job", async () => {
    const t = setup();
    await t.channels.add(anna, sub);
    await t.run(job(), now);
    await t.run(job(2), now);
    expect(t.channel.sent).toHaveLength(1);
  });

  it("US-MON-01 without a push subscription the reminder stays in the in-app inbox, nothing disappears (P-10)", async () => {
    const t = setup();
    await t.run(job(), now);
    expect(t.channel.sent).toHaveLength(0);
    const [row] = await t.reminders.list(anna, 10);
    expect(row?.status).toBe("in_app");
    expect(row?.items.map((i) => i.id)).toEqual(["treatment:1"]);
  });

  it("US-MON-08 a paused occasion is not in the message; with everything paused nothing is sent", async () => {
    const t = setup();
    await t.channels.add(anna, sub);
    await t.reminders.saveSettings(anna, {
      ...(await t.reminders.settings(anna)),
      paused: { treatment: "2026-10-12" },
    });
    await t.run(job(), now);
    expect(t.channel.sent).toHaveLength(0);
    expect((await t.reminders.find(anna, "2026-10-10"))?.status).toBe("none");
  });

  it("FR-MON-08 a failing delivery is thrown for a retry, stays pending, and is marked failed after the third attempt", async () => {
    const t = setup();
    await t.channels.add(anna, sub);
    t.channel.failures = 3;
    await expect(t.run(job(1), now)).rejects.toThrow("channel down");
    expect((await t.reminders.find(anna, "2026-10-10"))?.status).toBe("pending");
    await expect(t.run(job(2), now)).rejects.toThrow();
    await expect(t.run(job(3), now)).rejects.toThrow();
    const row = await t.reminders.find(anna, "2026-10-10");
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(3);
    expect(row?.lastError).toBe("channel down");
  });

  it("FR-MON-08 a retry after a failure delivers the stored bundle without deriving it again", async () => {
    const t = setup();
    await t.channels.add(anna, sub);
    t.channel.failures = 1;
    await expect(t.run(job(1), now)).rejects.toThrow();
    await t.run(job(2), now);
    expect(t.channel.sent).toHaveLength(1);
    expect((await t.reminders.find(anna, "2026-10-10"))?.status).toBe("delivered");
  });

  it("US-MON-01 refuses a job without its payload instead of guessing", async () => {
    const t = setup();
    await expect(t.run({ ...job(), payload: {} }, now)).rejects.toThrow("payload");
  });
});

describe("US-MON-01 the scheduler orders one check per account and local day at the chosen time", () => {
  const berlin = { userId: anna, timeZone: "Europe/Berlin" };
  const deps = (roster = rosterOf(berlin)) => {
    const reminders = new InMemoryReminders();
    const queue = new InMemoryJobQueue();
    return { reminders, queue, deps: { roster, reminders, queue } };
  };

  it("US-MON-01 orders nothing before 08:00 local time and one job from then on", async () => {
    const t = deps();
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T05:59:00Z"))).toBe(0);
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T06:00:00Z"))).toBe(1);
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T06:05:00Z"))).toBe(0);
    const claimed = await t.queue.claim("w", new Date("2026-10-10T06:05:00Z"), 60_000);
    expect(claimed?.type).toBe(REMINDER_JOB_TYPE);
    expect(claimed?.payload).toEqual({
      userId: anna,
      date: "2026-10-10",
      timeZone: "Europe/Berlin",
    });
    expect(claimed?.maxAttempts).toBe(3);
  });

  it("NFR-08 the day is the local day of the account: 23:30 UTC on the 10th is already the 11th in Berlin", async () => {
    const t = deps();
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T23:30:00Z"))).toBe(0);
    expect(await scheduleReminders(t.deps, new Date("2026-10-11T06:00:00Z"))).toBe(1);
    const job = await t.queue.claim("w", new Date("2026-10-11T06:00:00Z"), 60_000);
    expect(job?.payload["date"]).toBe("2026-10-11");
  });

  it("US-MON-08 a chosen time and quiet hours move the order to the end of the quiet hours", async () => {
    const t = deps();
    await t.reminders.saveSettings(anna, {
      ...(await t.reminders.settings(anna)),
      quietFrom: "07:00",
      quietTo: "09:30",
    });
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T07:29:00Z"))).toBe(0);
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T07:30:00Z"))).toBe(1);
  });

  it("FR-MON-02 a day that already has its row is not ordered again", async () => {
    const t = deps();
    await t.reminders.create(anna, "2026-10-10", [], "none");
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T12:00:00Z"))).toBe(0);
  });

  it("NFR-08 an account without a valid time zone is skipped, never guessed", async () => {
    const t = deps(rosterOf({ userId: anna, timeZone: "Nowhere/Land" }));
    expect(await scheduleReminders(t.deps, new Date("2026-10-10T12:00:00Z"))).toBe(0);
  });
});
