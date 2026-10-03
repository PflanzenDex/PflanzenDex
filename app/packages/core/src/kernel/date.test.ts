import { describe, expect, it } from "vitest";
import { localToday, isTimeZone } from "./date";

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
