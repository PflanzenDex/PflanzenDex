import { describe, expect, it } from "vitest";
import { checkDailyLimit, dayWindow } from "./limit";
import { InMemoryAiLog } from "../test-helpers";

const noon = new Date("2026-10-10T12:00:00Z");
const entry = (connectionId: string) => ({ connectionId, operation: "status", effect: "read" });

describe("US-KI-06 daily limit per connection", () => {
  it("US-KI-06 allows calls up to the limit and then answers ai.rate_limited with the time to retry", async () => {
    const log = new InMemoryAiLog();
    for (let i = 0; i < 3; i++) await log.record("anna", entry("c1"), noon);
    const call = { userId: "anna", connectionId: "c1", now: noon };
    expect((await checkDailyLimit(log, { ...call, limit: 4 })).ok).toBe(true);
    const r = await checkDailyLimit(log, { ...call, limit: 3 });
    expect(!r.ok && r.error.code).toBe("ai.rate_limited");
    expect(r.retryAt?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("US-KI-06 counts per connection and per day: another connection, another account and yesterday do not count", async () => {
    const log = new InMemoryAiLog();
    await log.record("anna", entry("c2"), noon);
    await log.record("ben", entry("c1"), noon);
    await log.record("anna", entry("c1"), new Date("2026-10-09T23:59:00Z"));
    const r = await checkDailyLimit(log, {
      userId: "anna",
      connectionId: "c1",
      now: noon,
      limit: 1,
    });
    expect(r.ok && r.value.used).toBe(0);
  });

  it("US-KI-06 the day window runs from UTC midnight to the next one", () => {
    expect(dayWindow(noon).start.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });
});
