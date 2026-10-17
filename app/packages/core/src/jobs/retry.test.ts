import { describe, expect, it } from "vitest";
import { nextRetryAt, retryDelayMs } from "./retry";

describe("US-QS-03 retry of a failed background job", () => {
  it("US-QS-03 the delay doubles per failed attempt and is capped", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(40)).toBe(60 * 60 * 1000);
  });

  it("US-QS-03 schedules the retry from the given time, and gives up after the last attempt", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(nextRetryAt(1, 3, now)).toEqual(new Date("2026-10-05T10:00:30Z"));
    expect(nextRetryAt(3, 3, now)).toBeNull();
  });
});
