import { describe, expect, it } from "vitest";
import { addDays, localToday } from "./pause";

describe("US-MON-08 pause for a week", () => {
  it("US-MON-08 takes today from the zone of the profile, not from UTC (NFR-08)", () => {
    const now = new Date("2026-10-10T23:30:00Z");
    expect(localToday("Europe/Berlin", now)).toBe("2026-10-11");
    expect(localToday("America/Los_Angeles", now)).toBe("2026-10-10");
  });

  it("US-MON-08 adds days across month and year ends", () => {
    expect(addDays("2026-10-10", 7)).toBe("2026-10-17");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-25", 7)).toBe("2028-03-03");
  });
});
