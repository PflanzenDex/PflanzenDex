import { describe, expect, it } from "vitest";
import { anniversaries, ANNIVERSARY_LIMITS, type AnniversarySpecimen } from "../index";

const sp = (over: Partial<AnniversarySpecimen> = {}): AnniversarySpecimen => ({
  id: "s1",
  name: "Aloe",
  caughtOn: "2025-04-10",
  archivedOn: null,
  ...over,
});

describe("US-ACH-06 anniversaries with the plant", () => {
  it("US-ACH-06 shows the yearly anniversary on the day itself", () => {
    expect(anniversaries([sp()], "2026-04-10")).toEqual([
      { specimenId: "s1", name: "Aloe", months: 12, date: "2026-04-10", caughtOn: "2025-04-10" },
    ]);
  });

  it("US-ACH-06 shows the half-year anniversary", () => {
    const [a] = anniversaries([sp()], "2025-10-10");
    expect(a?.months).toBe(ANNIVERSARY_LIMITS.halfYearMonths);
  });

  it("US-ACH-06 shows nothing on an ordinary day, before the first half year and for future catch dates", () => {
    expect(anniversaries([sp()], "2026-01-15")).toEqual([]);
    expect(anniversaries([sp()], "2025-09-01")).toEqual([]);
    expect(anniversaries([sp({ caughtOn: "2027-01-01" })], "2026-10-10")).toEqual([]);
  });

  it("US-ACH-06 the entry stays until the end of that week (Sunday) and then disappears (P-10: the history keeps the age)", () => {
    // 2026-04-10 is a Friday; the week ends on Sunday 2026-04-12.
    expect(anniversaries([sp()], "2026-04-12")).toHaveLength(1);
    expect(anniversaries([sp()], "2026-04-13")).toEqual([]);
    expect(anniversaries([sp()], "2026-04-09")).toEqual([]);
  });

  it("US-ACH-06 an unknown catch date and an archived specimen show no anniversary (P-08)", () => {
    expect(anniversaries([sp({ caughtOn: null })], "2026-04-10")).toEqual([]);
    expect(anniversaries([sp({ archivedOn: "2026-01-01" })], "2026-04-10")).toEqual([]);
  });

  it("US-ACH-06 a month-end catch date falls on the last day of a shorter month", () => {
    const [a] = anniversaries([sp({ caughtOn: "2025-08-31" })], "2026-02-28");
    expect(a).toMatchObject({ months: 6, date: "2026-02-28" });
  });

  it("US-ACH-06 a leap day falls on 28 February in a common year", () => {
    const [a] = anniversaries([sp({ caughtOn: "2024-02-29" })], "2025-02-28");
    expect(a).toMatchObject({ months: 12, date: "2025-02-28" });
  });

  it("US-ACH-06 later anniversaries count in months and are ordered by date, then name", () => {
    const list = anniversaries(
      [
        sp({ id: "b", name: "Zeder", caughtOn: "2024-04-10" }),
        sp({ id: "a", name: "Aloe", caughtOn: "2025-04-10" }),
      ],
      "2026-04-10",
    );
    expect(list.map((x) => [x.name, x.months])).toEqual([
      ["Aloe", 12],
      ["Zeder", 24],
    ]);
  });
});
