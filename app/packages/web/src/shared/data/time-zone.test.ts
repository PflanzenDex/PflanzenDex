import { localToday } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTimeZone, deviceTimeZone, setProfileTimeZone } from "./time-zone";

// US-QS-32 (NFR-08): the calendar date of the keeper's zone, never the UTC date. The call sites compute it as
// `localToday(now, currentTimeZone())` (core), so these tests pin the zone that goes into that call.
afterEach(() => {
  setProfileTimeZone(null);
  vi.useRealTimers();
});

describe("US-QS-32 the local calendar date of the keeper", () => {
  it("US-QS-32 the date of an instant is taken in the profile's zone, near midnight", () => {
    // 2026-11-14 12:00 UTC is 13:00 in Berlin on the 14th and 01:00 in Auckland on the 15th.
    const instant = new Date("2026-11-14T12:00:00Z");
    setProfileTimeZone("Europe/Berlin");
    expect(localToday(instant, currentTimeZone())).toBe("2026-11-14");
    setProfileTimeZone("Pacific/Auckland");
    expect(localToday(instant, currentTimeZone())).toBe("2026-11-15");
  });

  it("US-QS-32 today is today in the profile's zone, not the UTC date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-11-14 23:30 UTC: already the 15th in Berlin, still the 14th in Los Angeles.
    vi.setSystemTime(new Date("2026-11-14T23:30:00Z"));
    setProfileTimeZone("Europe/Berlin");
    expect(localToday(new Date(), currentTimeZone())).toBe("2026-11-15");
    setProfileTimeZone("America/Los_Angeles");
    expect(localToday(new Date(), currentTimeZone())).toBe("2026-11-14");
  });

  it("US-QS-32 without a profile zone the device's zone decides", () => {
    setProfileTimeZone("Europe/Berlin");
    setProfileTimeZone(null);
    expect(currentTimeZone()).toBe(deviceTimeZone());
  });
});
