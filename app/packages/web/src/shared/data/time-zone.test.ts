import { afterEach, describe, expect, it, vi } from "vitest";
import { localDateOf, localTodayIso, setProfileTimeZone } from "./time-zone";

// US-QS-32 (NFR-08): the calendar date of the keeper's zone, never the UTC date.
afterEach(() => {
  setProfileTimeZone(null);
  vi.useRealTimers();
});

describe("US-QS-32 the local calendar date of the keeper", () => {
  it("US-QS-32 localDateOf gives the date of the instant in the profile's zone, near midnight", () => {
    // 2026-11-14 12:00 UTC is 13:00 in Berlin on the 14th and 01:00 in Auckland on the 15th.
    setProfileTimeZone("Europe/Berlin");
    expect(localDateOf("2026-11-14T12:00:00Z")).toBe("2026-11-14");
    setProfileTimeZone("Pacific/Auckland");
    expect(localDateOf("2026-11-14T12:00:00Z")).toBe("2026-11-15");
  });

  it("US-QS-32 localTodayIso is today in the profile's zone, not the UTC date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-11-14 23:30 UTC: already the 15th in Berlin, still the 14th in Los Angeles.
    vi.setSystemTime(new Date("2026-11-14T23:30:00Z"));
    setProfileTimeZone("Europe/Berlin");
    expect(localTodayIso()).toBe("2026-11-15");
    setProfileTimeZone("America/Los_Angeles");
    expect(localTodayIso()).toBe("2026-11-14");
  });
});
