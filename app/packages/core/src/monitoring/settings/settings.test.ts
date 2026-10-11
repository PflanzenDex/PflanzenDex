import { describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { InMemoryChannels, InMemoryReminders } from "../test-helpers";
import {
  monitoringSaveSettings,
  monitoringSubscribe,
  monitoringUnsubscribe,
  reminderInbox,
} from "./settings";

const idempotency = new InMemoryIdempotencyStore();
let counter = 0;
const call = (userId: string | null, input: unknown, key = `k${++counter}`) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: key,
});
const valid = {
  sendTime: "07:30",
  quietFrom: "22:00",
  quietTo: "06:00",
  paused: { treatment: "2026-10-17" },
  measurementDays: 14,
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("US-MON-08 control reminders", () => {
  it("US-MON-08 saves time, quiet hours, pause and days for the own account only", async () => {
    const reminders = new InMemoryReminders();
    const op = monitoringSaveSettings({ reminders });
    expect(code(await execute(op, { idempotency }, call("anna", valid)))).toBe("ok");
    expect((await reminders.settings("anna")).sendTime).toBe("07:30");
    expect((await reminders.settings("ben")).sendTime).toBe("08:00");
  });

  it("US-MON-08 refuses a bad time, a half quiet window, an unknown occasion and a bad pause date", async () => {
    const op = monitoringSaveSettings({ reminders: new InMemoryReminders() });
    for (const bad of [
      { ...valid, sendTime: "25:00" },
      { ...valid, quietTo: null },
      { ...valid, paused: { sleeping: "2026-10-17" } },
      { ...valid, paused: { treatment: "2026-02-30" } },
      { ...valid, measurementDays: 0 },
      { ...valid, measurementDays: 400 },
    ])
      expect(code(await execute(op, { idempotency }, call("anna", bad)))).toBe("input.invalid");
  });

  it("US-MON-08 refuses a call without sign-in", async () => {
    const op = monitoringSaveSettings({ reminders: new InMemoryReminders() });
    expect(code(await execute(op, { idempotency }, call(null, valid)))).toBe(
      "access.not_signed_in",
    );
  });
});

describe("US-MON-08 push subscriptions (DM-MON-01 delivery_channel)", () => {
  const sub = { endpoint: "https://push.example/abc", p256dh: "k", auth: "a" };

  it("US-MON-08 registers a subscription once per endpoint, per account", async () => {
    const channels = new InMemoryChannels();
    const op = monitoringSubscribe({ channels });
    const first = await execute(op, { idempotency }, call("anna", sub));
    const again = await execute(op, { idempotency }, call("anna", sub));
    expect(first.ok && first.value.created).toBe(true);
    expect(again.ok && again.value.created).toBe(false);
    expect(await channels.subscriptions("ben")).toEqual([]);
    expect(await channels.subscriptions("anna")).toHaveLength(1);
  });

  it("US-MON-08 refuses an endpoint that is not https and incomplete keys", async () => {
    const op = monitoringSubscribe({ channels: new InMemoryChannels() });
    for (const bad of [
      { ...sub, endpoint: "http://push.example/abc" },
      { ...sub, endpoint: "not a url at all" },
      { ...sub, auth: "" },
    ])
      expect(code(await execute(op, { idempotency }, call("anna", bad)))).toBe("input.invalid");
  });

  it("US-MON-08 refuses the 11th subscription with monitoring.subscription_limit", async () => {
    const channels = new InMemoryChannels();
    const op = monitoringSubscribe({ channels });
    for (let i = 0; i < 10; i++)
      await execute(
        op,
        { idempotency },
        call("anna", { ...sub, endpoint: `https://push.example/${i}x` }),
      );
    expect(
      code(
        await execute(
          op,
          { idempotency },
          call("anna", { ...sub, endpoint: "https://push.example/extra" }),
        ),
      ),
    ).toBe("monitoring.subscription_limit");
  });

  it("US-MON-08 removes a subscription; an unknown endpoint changes nothing", async () => {
    const channels = new InMemoryChannels();
    await channels.add("anna", sub);
    const op = monitoringUnsubscribe({ channels });
    const gone = await execute(op, { idempotency }, call("anna", { endpoint: sub.endpoint }));
    const none = await execute(op, { idempotency }, call("anna", { endpoint: sub.endpoint }));
    expect(gone.ok && gone.value.removed).toBe(true);
    expect(none.ok && none.value.removed).toBe(false);
  });
});

describe("US-MON-01 the in-app inbox", () => {
  it("US-MON-01 lists the reminders of the account, newest first, without days with nothing to do", async () => {
    const reminders = new InMemoryReminders();
    const item = { id: "a", occasion: "treatment" as const, text: "t", nextAction: "n" };
    await reminders.create("anna", "2026-10-09", [item], "in_app");
    await reminders.create("anna", "2026-10-10", [item], "delivered");
    await reminders.create("anna", "2026-10-11", [], "none");
    await reminders.create("ben", "2026-10-10", [item], "in_app");
    const inbox = await reminderInbox({ reminders }, "anna");
    expect(inbox.map((r) => r.localDate)).toEqual(["2026-10-10", "2026-10-09"]);
  });
});
