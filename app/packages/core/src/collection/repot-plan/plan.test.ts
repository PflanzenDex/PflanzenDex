import { describe, expect, it } from "vitest";
import {
  GENERAL_STARTING_VALUE,
  REPOT_INTERVAL_STARTING_MONTHS,
  orderFreePots,
  repotPlan,
  wholeMonthsBetween,
  type PlanPot,
  type RepotPlanInput,
} from "./plan";

const pot = (id: string, name: string, diameterCm: number | null): PlanPot => ({
  id,
  name,
  diameterCm,
});
const base: RepotPlanInput = {
  today: "2026-11-07",
  cutting: false,
  lastRepot: "2024-11-07",
  openSigns: [],
  phase: "growth",
  currentPot: { diameterCm: 12 },
  freePots: [],
  citedInterval: null,
};
const plan = (over: Partial<RepotPlanInput> = {}) => repotPlan({ ...base, ...over });

describe("US-BES-19 the time hint (FR-BES-27, P-08)", () => {
  it("US-BES-19: after 24 months without a cited interval the hint names the months and the general starting value", () => {
    expect(REPOT_INTERVAL_STARTING_MONTHS).toBe(24);
    expect(plan().hints).toEqual([
      { reason: "interval", monthsAgo: 24, source: GENERAL_STARTING_VALUE },
    ]);
  });

  it("US-BES-19: a repot less than the interval ago gets no time hint", () => {
    expect(plan({ lastRepot: "2024-11-08" }).hints).toEqual([]);
  });

  it("US-BES-19: the month counts once its day is reached (whole calendar months, NFR-08)", () => {
    expect(wholeMonthsBetween("2024-11-07", "2026-11-07")).toBe(24);
    expect(wholeMonthsBetween("2024-11-08", "2026-11-07")).toBe(23);
    expect(wholeMonthsBetween("2025-01-31", "2026-03-01")).toBe(13);
    expect(wholeMonthsBetween("2024-12-31", "2026-01-01")).toBe(12);
  });

  it("US-BES-19: a cited interval replaces the starting value and its source is named", () => {
    const cited = { months: 18, source: "Quelle: Hersteller, Stand 2026" };
    expect(plan({ lastRepot: "2025-01-01", citedInterval: cited }).hints).toEqual([
      { reason: "interval", monthsAgo: 22, source: "Quelle: Hersteller, Stand 2026" },
    ]);
  });

  it("US-BES-19: with an unknown repot day no time hint shows, and the plan says the day is unknown (P-08)", () => {
    const r = plan({ lastRepot: null });
    expect(r.hints).toEqual([]);
    expect(r.lastRepot).toBeNull();
  });

  it("US-BES-19: a cutting gets no hint at all, its time and its observations (US-BES-04)", () => {
    expect(
      plan({ cutting: true, openSigns: [{ sign: "roots_out", tickedOn: "2026-11-01" }] }).hints,
    ).toEqual([]);
  });
});

describe("US-BES-19 the observations as hints (DM-BES-09)", () => {
  it("US-BES-19: a ticked observation is the reason of its hint, with the day it was ticked and the keeper as source", () => {
    expect(
      plan({ lastRepot: "2026-10-01", openSigns: [{ sign: "tips_over", tickedOn: "2026-11-02" }] })
        .hints,
    ).toEqual([{ reason: "tips_over", tickedOn: "2026-11-02", source: "keeper_observation" }]);
  });

  it("US-BES-19: the time hint comes first, then the observations in the order they were given", () => {
    const r = plan({
      openSigns: [
        { sign: "roots_out", tickedOn: "2026-11-01" },
        { sign: "dries_fast", tickedOn: "2026-11-03" },
      ],
    });
    expect(r.hints.map((h) => h.reason)).toEqual(["interval", "roots_out", "dries_fast"]);
  });
});

describe("US-BES-19 the season (FR-BES-27)", () => {
  it("US-BES-19: in dormancy a hint warns and suggests repotting in spring", () => {
    expect(plan({ phase: "dormancy" }).seasonAdvice).toBe("spring");
  });

  it("US-BES-19: in the growth phase the hint shows without the warning", () => {
    expect(plan({ phase: "growth" }).seasonAdvice).toBeNull();
  });

  it("US-BES-19: while the phase is unknown the plan says so (P-08)", () => {
    expect(plan({ phase: null }).seasonAdvice).toBe("phase_unknown");
  });

  it("US-BES-19: without a hint there is no season advice, whatever the phase", () => {
    expect(plan({ phase: "dormancy", lastRepot: "2026-10-01" }).seasonAdvice).toBeNull();
  });
});

describe("US-BES-19 the free pots (US-EQU-01, DM-EQU-05)", () => {
  const pots = [
    pot("a", "Topf A", 10),
    pot("b", "Topf B", 16),
    pot("c", "Topf C", 14),
    pot("d", "Topf D", null),
    pot("e", "Topf E", 6),
  ];

  it("US-BES-19: with a known current size the larger pots come first, the next size up first, then the smaller largest first, unknown last", () => {
    expect(orderFreePots(pots, 12).map((p) => p.id)).toEqual(["c", "b", "a", "e", "d"]);
  });

  it("US-BES-19: without a known current size the free pots are listed by name", () => {
    expect(orderFreePots(pots, null).map((p) => p.name)).toEqual([
      "Topf A",
      "Topf B",
      "Topf C",
      "Topf D",
      "Topf E",
    ]);
  });

  it("US-BES-19: the plan lists the free pots in that order and names the current pot's size", () => {
    const r = plan({ freePots: pots, currentPot: { diameterCm: 12 } });
    expect(r.freePots.map((p) => p.id)).toEqual(["c", "b", "a", "e", "d"]);
    expect(r.currentPot).toEqual({ diameterCm: 12 });
  });

  it("US-BES-19: a plant without a recorded pot lists its free pots by name and has no size to compare (P-08)", () => {
    const r = plan({ freePots: pots, currentPot: null });
    expect(r.freePots.map((p) => p.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.currentPot).toBeNull();
  });

  it("US-BES-19: there is no hint about the pot size, no cited rule exists (P-08)", () => {
    const r = plan({
      lastRepot: "2026-10-01",
      currentPot: { diameterCm: 6 },
      freePots: [pot("x", "Groß", 40)],
    });
    expect(r.hints).toEqual([]);
  });
});
