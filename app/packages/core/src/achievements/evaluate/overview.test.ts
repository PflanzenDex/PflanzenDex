import { describe, expect, it } from "vitest";
import { achievementOverview, evaluateAchievements } from "../index";
import type { AchievementFacts } from "../index";

const empty: AchievementFacts = {
  specimens: [],
  measurements: [],
  treatmentCourses: [],
  handovers: [],
};
const spec = (id: string, extra = {}) => ({
  id,
  name: id,
  caughtOn: null,
  archivedOn: null,
  cuttingRootedOn: null,
  dormancy: null,
  ...extra,
});

describe("US-ACH-02 overview", () => {
  it("US-ACH-02 lists the four groups in order, collecting without achievements of its own", () => {
    const o = achievementOverview(evaluateAchievements(empty, "2026-10-15"));
    expect(o.groups.map((g) => g.group)).toEqual(["care", "growth", "swapping", "collecting"]);
    expect(o.groups[3]).toMatchObject({ earned: [], open: [] });
  });

  it("US-ACH-02 names the first step when nothing is earned, never an empty list", () => {
    const o = achievementOverview(evaluateAchievements(empty, "2026-10-15"));
    expect(o.earnedCount).toBe(0);
    expect(o.firstStep?.key).toBe("first-measurement-photo.next");
  });

  it("US-ACH-02 shows earned newest first and open ones in the fixed order, no first step then", () => {
    const facts: AchievementFacts = {
      ...empty,
      specimens: [spec("a", { cuttingRootedOn: "2026-05-04" })],
      measurements: [{ specimenId: "a", date: "2026-03-02", quality: "healthy", hasPhoto: true }],
      handovers: [{ date: "2026-08-01", specimenId: "a" }],
    };
    const o = achievementOverview(evaluateAchievements(facts, "2026-10-15"));
    expect(o.firstStep).toBeNull();
    expect(o.earnedCount).toBe(3);
    expect(o.groups[0]?.earned.map((s) => s.id)).toEqual(["cutting-rooted"]);
    expect(o.groups[0]?.open.map((s) => s.id)).toEqual(["treatment-completed", "through-dormancy"]);
    expect(o.groups[1]?.earned.map((s) => s.id)).toEqual(["first-measurement-photo"]);
    expect(o.groups[2]?.earned.map((s) => s.id)).toEqual(["first-handover"]);
  });

  it("US-ACH-02 two earned in one group: newest first, equal dates keep the definition order", () => {
    const facts: AchievementFacts = {
      ...empty,
      specimens: [spec("a", { cuttingRootedOn: "2026-05-04" })],
      treatmentCourses: [{ specimenId: "a", dates: [{ doneOn: "2026-06-01" }] }],
    };
    const care = achievementOverview(evaluateAchievements(facts, "2026-10-15")).groups[0];
    expect(care?.earned.map((s) => s.id)).toEqual(["treatment-completed", "cutting-rooted"]);
    const same = {
      ...facts,
      treatmentCourses: [{ specimenId: "a", dates: [{ doneOn: "2026-05-04" }] }],
    };
    const tie = achievementOverview(evaluateAchievements(same, "2026-10-15")).groups[0];
    expect(tie?.earned.map((s) => s.id)).toEqual(["cutting-rooted", "treatment-completed"]);
  });
});
