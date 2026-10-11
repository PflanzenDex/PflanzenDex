import { describe, expect, it } from "vitest";
import { localToday, isTimeZone, localInstant, daysBetween } from "./date";

// NFR-08, QG-D4, FR-BES-04 (prototype bug B-01): calendar dates are local dates of the user, never the UTC date.
describe("US-BES-02 caught_at: today's local date (NFR-08, FR-BES-04)", () => {
  const nightInUtc = new Date("2026-10-02T23:30:00Z");

  it("the same moment yields a different local date depending on the time zone", () => {
    expect(localToday(nightInUtc, "Europe/Berlin")).toBe("2026-10-03");
    expect(localToday(nightInUtc, "Pacific/Auckland")).toBe("2026-10-03");
    expect(localToday(nightInUtc, "America/New_York")).toBe("2026-10-02");
    expect(localToday(nightInUtc, "UTC")).toBe("2026-10-02");
  });

  it("the clock change (2026-03-29 in Berlin) does not shift the calendar date", () => {
    expect(localToday(new Date("2026-03-28T23:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    expect(localToday(new Date("2026-03-29T21:59:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    expect(localToday(new Date("2026-03-29T22:00:00Z"), "Europe/Berlin")).toBe("2026-03-30");
  });

  it("the date always has the form YYYY-MM-DD with leading zeros", () => {
    expect(localToday(new Date("2026-01-05T12:00:00Z"), "Europe/Berlin")).toBe("2026-01-05");
  });

  it("recognizes valid time zone names and rejects everything else", () => {
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    for (const wrong of ["Mars/Olympus", "", "+02:00", "  ", 42, null, undefined])
      expect(isTimeZone(wrong)).toBe(false);
  });
});

describe("US-MON-01 the local time of a reminder as a point in time (NFR-08)", () => {
  it("US-MON-01 08:00 in Berlin is 06:00 UTC in summer and 07:00 UTC in winter", () => {
    expect(localInstant("2026-07-01", "08:00", "Europe/Berlin").toISOString()).toBe(
      "2026-07-01T06:00:00.000Z",
    );
    expect(localInstant("2026-12-01", "08:00", "Europe/Berlin").toISOString()).toBe(
      "2026-12-01T07:00:00.000Z",
    );
  });

  it("US-MON-01 follows the zone of the user, also east of the date line", () => {
    expect(localInstant("2026-10-10", "08:00", "Pacific/Auckland").toISOString()).toBe(
      "2026-10-09T19:00:00.000Z",
    );
    expect(
      localToday(localInstant("2026-10-10", "08:00", "Pacific/Auckland"), "Pacific/Auckland"),
    ).toBe("2026-10-10");
  });

  it("US-MON-01 counts whole calendar days between two local dates, across a month end", () => {
    expect(daysBetween("2026-09-20", "2026-10-10")).toBe(20);
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-10-10", "2026-10-09")).toBe(-1);
  });
});
