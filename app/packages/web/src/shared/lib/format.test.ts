import { describe, expect, it } from "vitest";
import { dateText, onDate, summaryDate } from "./format";

// US-QS-32 (SG-FMT-01): a date is "TT.MM.JJJJ"; in a summary line up to 7 days back or ahead it is relative.
const NBSP = "\u00a0";
const TODAY = "2026-11-15";

/** The calendar date `days` days after `from` (`YYYY-MM-DD`), by UTC calendar arithmetic only. */
function shifted(from: string, days: number): string {
  const [y = 0, m = 1, d = 1] = from.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${two(next.getUTCMonth() + 1)}-${two(next.getUTCDate())}`;
}

describe("US-QS-32 summaryDate: a date in a summary line", () => {
  it("US-QS-32 today, yesterday and tomorrow are words", () => {
    expect(summaryDate("2026-11-15", TODAY)).toBe("heute");
    expect(summaryDate("2026-11-14", TODAY)).toBe("gestern");
    expect(summaryDate("2026-11-16", TODAY)).toBe("morgen");
  });

  it("US-QS-32 the days up to 7 back or ahead are counted, the number and Tagen stay together", () => {
    expect(summaryDate("2026-11-09", TODAY)).toBe(`vor 6${NBSP}Tagen`);
    expect(summaryDate("2026-11-08", TODAY)).toBe(`vor 7${NBSP}Tagen`);
    expect(summaryDate("2026-11-21", TODAY)).toBe(`in 6${NBSP}Tagen`);
    expect(summaryDate("2026-11-22", TODAY)).toBe(`in 7${NBSP}Tagen`);
  });

  it("US-QS-32 from 8 days back or ahead the absolute date TT.MM.JJJJ is shown", () => {
    expect(summaryDate("2026-11-07", TODAY)).toBe("07.11.2026");
    expect(summaryDate("2026-11-23", TODAY)).toBe("23.11.2026");
  });

  it("US-QS-32 the month boundary counts the days of the calendar", () => {
    expect(summaryDate("2026-10-31", "2026-11-03")).toBe(`vor 3${NBSP}Tagen`);
    expect(summaryDate("2026-11-01", "2026-10-28")).toBe(`in 4${NBSP}Tagen`);
    expect(summaryDate("2026-10-25", "2026-11-02")).toBe("25.10.2026");
  });

  it("US-QS-32 the year boundary counts the days of the calendar", () => {
    expect(summaryDate("2026-12-31", "2027-01-03")).toBe(`vor 3${NBSP}Tagen`);
    expect(summaryDate("2027-01-02", "2026-12-28")).toBe(`in 5${NBSP}Tagen`);
    expect(summaryDate("2026-12-25", "2027-01-02")).toBe("25.12.2026");
  });

  it("US-QS-32 February counts its real length: 2028 has the 29th, 2026 does not", () => {
    expect(summaryDate("2028-03-01", "2028-02-28")).toBe(`in 2${NBSP}Tagen`);
    expect(summaryDate("2026-03-01", "2026-02-28")).toBe("morgen");
  });

  it("US-QS-32 the daylight-saving day 2026-03-29 counts one calendar day (Europe/Berlin switch)", () => {
    expect(summaryDate("2026-03-29", "2026-03-28")).toBe("morgen");
    expect(summaryDate("2026-03-28", "2026-03-29")).toBe("gestern");
    expect(summaryDate("2026-03-29", "2026-03-30")).toBe("gestern");
    expect(summaryDate("2026-03-29", "2026-03-22")).toBe(`in 7${NBSP}Tagen`);
    expect(summaryDate("2026-03-22", "2026-03-29")).toBe(`vor 7${NBSP}Tagen`);
  });

  it("US-QS-32 every offset from -10 to +10 days is the relative form or the absolute date, never a mix", () => {
    for (let n = -10; n <= 10; n += 1) {
      const iso = shifted(TODAY, n);
      const text = summaryDate(iso, TODAY);
      if (Math.abs(n) <= 7) expect(text).not.toMatch(/\d{2}\.\d{2}\.\d{4}/);
      else expect(text).toBe(dateText(iso));
    }
  });
});

describe("US-QS-32 onDate: a date in a phrase that reads 'am <date>'", () => {
  it("US-QS-32 within 7 days the phrase is the relative form, so 'Gesund am heute' never appears", () => {
    expect(onDate("2026-11-15", TODAY)).toBe("heute");
    expect(onDate("2026-11-14", TODAY)).toBe("gestern");
    expect(onDate("2026-11-09", TODAY)).toBe(`vor 6${NBSP}Tagen`);
    expect(onDate("2026-11-22", TODAY)).toBe(`in 7${NBSP}Tagen`);
  });

  it("US-QS-32 beyond 7 days it reads 'am TT.MM.JJJJ'", () => {
    expect(onDate("2026-11-07", TODAY)).toBe("am 07.11.2026");
    expect(onDate("2026-10-01", TODAY)).toBe("am 01.10.2026");
  });

  it("US-QS-32 the day 8 back and the day 8 ahead read as the absolute date", () => {
    expect(onDate("2026-11-07", TODAY)).toBe("am 07.11.2026");
    expect(onDate("2026-11-23", TODAY)).toBe("am 23.11.2026");
  });
});
