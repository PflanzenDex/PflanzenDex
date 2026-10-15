import { describe, expect, it } from "vitest";
import { evaluateAchievements } from "../index";
import type { AchievementFacts, AchievementStatus, MeasurementFact, SpecimenFact } from "../index";

const specimen = (extra: Partial<SpecimenFact> = {}): SpecimenFact => ({
  id: "s1",
  name: "Aloe vera 1",
  caughtOn: null,
  archivedOn: null,
  cuttingRootedOn: null,
  dormancy: null,
  ...extra,
});
const m = (date: string, extra: Partial<MeasurementFact> = {}): MeasurementFact => ({
  specimenId: "s1",
  date,
  quality: "healthy",
  hasPhoto: false,
  ...extra,
});
const facts = (extra: Partial<AchievementFacts> = {}): AchievementFacts => ({
  specimens: [specimen()],
  measurements: [],
  treatmentCourses: [],
  handovers: [],
  ...extra,
});
const status = (f: AchievementFacts, id: string, today = "2027-06-01"): AchievementStatus => {
  const found = evaluateAchievements(f, today).find((s) => s.id === id);
  if (!found) throw new Error(`unknown achievement ${id}`);
  return found;
};

describe("US-ACH-01 earn achievements", () => {
  it("US-ACH-01 lists every definition in the fixed order, all open without data", () => {
    const all = evaluateAchievements(facts({ specimens: [] }), "2026-10-15");
    expect(all.map((s) => s.id)).toEqual([
      "first-measurement-photo",
      "cutting-rooted",
      "treatment-completed",
      "through-dormancy",
      "healthy-for-a-year",
      "first-handover",
    ]);
    expect(all.every((s) => !s.earned && s.nextStep !== null && s.earnedOn === null)).toBe(true);
  });

  it("US-ACH-01 first measurement with photo is earned on the date of the earliest photo", () => {
    const f = facts({ measurements: [m("2026-03-02", { hasPhoto: true }), m("2026-01-01")] });
    const s = status(f, "first-measurement-photo");
    expect(s).toMatchObject({
      earned: true,
      earnedOn: "2026-03-02",
      specimenId: "s1",
      nextStep: null,
    });
  });

  it("US-ACH-01 missing data is named, never failed", () => {
    expect(status(facts(), "first-measurement-photo").missing).toBe("no_measurements");
    expect(
      status(facts({ measurements: [m("2026-01-01")] }), "first-measurement-photo").missing,
    ).toBe("no_photo");
    expect(status(facts(), "through-dormancy").missing).toBe("no_catch_date");
    expect(status(facts(), "treatment-completed").missing).toBe("no_treatment");
  });

  it("US-ACH-01 cutting rooted uses the repot date, not the date of evaluation", () => {
    const f = facts({ specimens: [specimen({ cuttingRootedOn: "2026-05-04" })] });
    expect(status(f, "cutting-rooted")).toMatchObject({ earned: true, earnedOn: "2026-05-04" });
  });

  it("US-ACH-01 treatment completed needs all dates; earned on the last tick", () => {
    const open = facts({
      treatmentCourses: [{ specimenId: "s1", dates: [{ doneOn: "2026-02-01" }, { doneOn: null }] }],
    });
    expect(status(open, "treatment-completed")).toMatchObject({
      earned: false,
      nextStep: { key: "treatment-completed.next", specimenId: "s1" },
    });
    const done = facts({
      treatmentCourses: [
        { specimenId: "s1", dates: [{ doneOn: "2026-02-08" }, { doneOn: "2026-02-01" }] },
      ],
    });
    expect(status(done, "treatment-completed")).toMatchObject({
      earned: true,
      earnedOn: "2026-02-08",
    });
  });

  it("US-ACH-01 through a dormancy phase needs the full period after the catch date", () => {
    const dormancy = { from: "11-01", until: "03-15" };
    const caughtMid = facts({ specimens: [specimen({ caughtOn: "2025-12-01", dormancy })] });
    expect(status(caughtMid, "through-dormancy", "2026-10-01").earned).toBe(false);
    expect(status(caughtMid, "through-dormancy", "2027-03-15")).toMatchObject({
      earned: true,
      earnedOn: "2027-03-15",
    });
    const before = facts({ specimens: [specimen({ caughtOn: "2025-10-01", dormancy })] });
    expect(status(before, "through-dormancy", "2026-03-15").earnedOn).toBe("2026-03-15");
  });

  it("US-ACH-01 a dormancy that ended after archiving does not count, one before it stays earned", () => {
    const dormancy = { from: "11-01", until: "03-15" };
    const early = facts({
      specimens: [specimen({ caughtOn: "2025-10-01", archivedOn: "2026-02-01", dormancy })],
    });
    expect(status(early, "through-dormancy").earned).toBe(false);
    const late = facts({
      specimens: [specimen({ caughtOn: "2025-10-01", archivedOn: "2026-05-01", dormancy })],
    });
    expect(status(late, "through-dormancy")).toMatchObject({
      earned: true,
      earnedOn: "2026-03-15",
    });
  });

  it("US-ACH-01 healthy for a year needs 4 healthy measurements over 12 months", () => {
    const dates = ["2025-06-01", "2025-09-01", "2026-01-01", "2026-06-01"];
    const ok = facts({ measurements: dates.map((d) => m(d)) });
    expect(status(ok, "healthy-for-a-year")).toMatchObject({
      earned: true,
      earnedOn: "2026-06-01",
    });
    const short = facts({
      measurements: ["2025-06-01", "2025-09-01", "2026-01-01", "2026-05-31"].map((d) => m(d)),
    });
    expect(status(short, "healthy-for-a-year").earned).toBe(false);
  });

  it("US-ACH-01 etiolated growth never counts as success", () => {
    const dates = ["2025-06-01", "2025-09-01", "2026-01-01", "2026-06-01"];
    const f = facts({
      measurements: dates.map((d, i) => m(d, { quality: i === 2 ? "etiolated" : "healthy" })),
    });
    expect(status(f, "healthy-for-a-year").earned).toBe(false);
  });

  it("US-ACH-01 too few measurements are reported as missing data", () => {
    const f = facts({ measurements: [m("2025-06-01"), m("2026-06-01")] });
    expect(status(f, "healthy-for-a-year")).toMatchObject({
      earned: false,
      missing: "too_few_measurements",
    });
  });

  it("US-ACH-01 first handover is earned on the earliest confirmed handover", () => {
    const f = facts({
      handovers: [
        { date: "2026-08-01", specimenId: "s2" },
        { date: "2026-07-01", specimenId: "s1" },
      ],
    });
    expect(status(f, "first-handover")).toMatchObject({
      earned: true,
      earnedOn: "2026-07-01",
      specimenId: "s1",
    });
  });

  it("US-ACH-01 an archived specimen keeps its achievements (P-10)", () => {
    const f = facts({
      specimens: [specimen({ archivedOn: "2026-09-01", cuttingRootedOn: "2026-05-04" })],
      measurements: [m("2026-03-02", { hasPhoto: true })],
    });
    expect(status(f, "cutting-rooted").earned).toBe(true);
    expect(status(f, "first-measurement-photo").earned).toBe(true);
  });

  it("US-ACH-01 is derived: a later change of other data does not move earned on", () => {
    const base = facts({ measurements: [m("2026-03-02", { hasPhoto: true })] });
    const more = facts({
      measurements: [...base.measurements, m("2026-09-02", { hasPhoto: true })],
    });
    expect(status(more, "first-measurement-photo").earnedOn).toBe(
      status(base, "first-measurement-photo").earnedOn,
    );
  });
});
