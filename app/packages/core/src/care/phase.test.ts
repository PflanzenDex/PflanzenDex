import { describe, expect, it } from "vitest";
import { localToday } from "../kernel";
import { carePhase, nextPhaseChange } from "./index";
import { addDays } from "./treatment-dates";

describe("US-PHA-04 Foresee the next phase change", () => {
  it("US-PHA-04 the change is today when today is the first day of the dormancy (From)", () => {
    expect(nextPhaseChange("11-01", "03-15", "2026-11-01")).toEqual({
      date: "2026-11-01",
      phase: "dormancy",
      days: 0,
    });
  });

  it("US-PHA-04 the growth phase begins the day after Until, because Until still belongs to the dormancy", () => {
    expect(nextPhaseChange("11-01", "03-15", "2027-03-15")).toEqual({
      date: "2027-03-16",
      phase: "growth",
      days: 1,
    });
    expect(nextPhaseChange("11-01", "03-15", "2027-03-16")).toEqual({
      date: "2027-03-16",
      phase: "growth",
      days: 0,
    });
  });

  it("US-PHA-04 earliest date on or after today: the nearer of the two bounds wins", () => {
    // Growth since 03-16: the dormancy begins next on 11-01 of this year.
    expect(nextPhaseChange("11-01", "03-15", "2026-10-05")).toEqual({
      date: "2026-11-01",
      phase: "dormancy",
      days: 27,
    });
    // In the middle of a period within one year: its end comes first.
    expect(nextPhaseChange("06-01", "08-31", "2026-07-15")).toEqual({
      date: "2026-09-01",
      phase: "growth",
      days: 48,
    });
  });

  it("US-PHA-04 both bounds of this year have passed: the change lies in the next year", () => {
    expect(nextPhaseChange("04-01", "06-30", "2026-10-05")).toEqual({
      date: "2027-04-01",
      phase: "dormancy",
      days: 178,
    });
  });

  it("US-PHA-04 a period across the turn of the year ends in the next year", () => {
    expect(nextPhaseChange("11-01", "03-15", "2026-12-20")).toEqual({
      date: "2027-03-16",
      phase: "growth",
      days: 86,
    });
    // Until 12-31: the growth phase begins on New Year's Day.
    expect(nextPhaseChange("10-01", "12-31", "2026-12-31")).toEqual({
      date: "2027-01-01",
      phase: "growth",
      days: 1,
    });
  });

  it("US-PHA-04 From 02-29 begins on 03-01 in a common year and on 02-29 in a leap year", () => {
    expect(nextPhaseChange("02-29", "05-31", "2026-02-01")).toMatchObject({
      date: "2026-03-01",
      phase: "dormancy",
    });
    expect(nextPhaseChange("02-29", "05-31", "2028-02-01")).toMatchObject({
      date: "2028-02-29",
      phase: "dormancy",
      days: 28,
    });
  });

  it("US-PHA-04 Until 02-29: the growth phase begins on 03-01 in leap and common years", () => {
    expect(nextPhaseChange("11-01", "02-29", "2028-02-10")).toMatchObject({
      date: "2028-03-01",
      phase: "growth",
    });
    expect(nextPhaseChange("11-01", "02-29", "2027-02-10")).toMatchObject({
      date: "2027-03-01",
      phase: "growth",
      days: 19,
    });
  });

  it("US-PHA-04 no change in this and the next year: null, never an invented date (P-08)", () => {
    expect(nextPhaseChange("01-01", "12-31", "2026-10-05")).toBeNull();
    // 03-01 to 02-28 leaves only the 29th of February as growth: 2028 is the next year of 2027, not of 2026.
    expect(nextPhaseChange("03-01", "02-28", "2026-01-10")).toBeNull();
    expect(nextPhaseChange("03-01", "02-28", "2027-01-10")).toEqual({
      date: "2028-02-29",
      phase: "growth",
      days: 415,
    });
  });

  it("US-PHA-04 counts calendar days, a daylight saving switch (2026-03-29 in Berlin) counts one day", () => {
    expect(nextPhaseChange("03-30", "05-31", "2026-03-28")).toMatchObject({ days: 2 });
  });

  it("US-PHA-04 today is the local date in the user's time zone, not the UTC date (NFR-08)", () => {
    const now = new Date("2026-10-31T23:30:00Z");
    expect(nextPhaseChange("11-01", "03-15", localToday(now, "Europe/Berlin"))).toMatchObject({
      days: 0,
    });
    expect(nextPhaseChange("11-01", "03-15", localToday(now, "UTC"))).toMatchObject({ days: 1 });
  });

  it("US-PHA-04 the forecast agrees with the phase list on every day of a leap year", () => {
    for (const [from, until] of [
      ["11-01", "03-15"],
      ["06-01", "08-31"],
      ["12-31", "01-01"],
      ["02-29", "03-01"],
    ] as const)
      for (let d = 0; d < 366; d += 1) {
        const today = addDays("2028-01-01", d);
        const next = nextPhaseChange(from, until, today);
        expect(next).not.toBeNull();
        if (!next) continue;
        expect(next.date >= today).toBe(true);
        expect(addDays(today, next.days)).toBe(next.date);
        expect(carePhase(from, until, next.date)).toBe(next.phase);
        expect(carePhase(from, until, addDays(next.date, -1))).not.toBe(next.phase);
        // No change lies between today and the forecast.
        for (let k = 0; k < next.days; k += 1)
          expect(carePhase(from, until, addDays(today, k))).toBe(carePhase(from, until, today));
      }
  });
});
