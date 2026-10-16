import { describe, expect, it } from "vitest";
import { achievementsView } from "./view";
import { readAchievementFacts, type FactSources } from "./facts";

// US-ACH-01, US-ACH-02: the facts are read from the own data through the ports (fakes, no database).
const specimen = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  speciesId: "sp1",
  name: `Aloe ${id}`,
  caughtAt: "2025-10-01",
  archivedAt: null,
  repottedAt: null,
  ...extra,
});
const treatment = (id: string, courseId: string | null, doneAt: string | null) => ({
  id,
  specimenId: "a",
  courseId,
  done: doneAt !== null,
  doneAt,
});

function sources(over: Partial<Record<keyof FactSources, unknown>> = {}): FactSources {
  const base = {
    specimens: {
      list: async () => [
        specimen("a", { repottedAt: "2026-05-04" }),
        specimen("b", { archivedAt: "2026-02-01" }),
      ],
    },
    species: {
      find: async () => null,
      findMany: async (_u: string, ids: readonly string[]) =>
        ids.map(() => ({ dormancyFrom: "11-01", dormancyUntil: "03-15" })),
    },
    profiles: { list: async () => [] },
    treatments: {
      open: async () => new Map([["a", [treatment("t3", "c1", null)]]]),
      done: async (_u: string, id: string) =>
        id === "a"
          ? [treatment("t1", "c1", "2026-02-01"), treatment("t0", null, "2026-01-01")]
          : [],
    },
    measurements: {
      list: async (_u: string, id: string) =>
        id === "a"
          ? [
              { date: "2026-03-02", quality: "healthy", photo: "p.jpg" },
              { date: "2026-03-09", quality: "etiolated", photo: null },
            ]
          : [],
    },
    swaps: {
      list: async () => [
        {
          status: "handed_over",
          handedOverAt: "2026-07-01T23:30:00.000Z",
          role: "giver",
          givenSpecimenId: "b",
          receivedSpecimenId: null,
        },
        {
          status: "requested",
          handedOverAt: null,
          role: "giver",
          givenSpecimenId: null,
          receivedSpecimenId: null,
        },
      ],
    },
  };
  return { ...base, ...over } as unknown as FactSources;
}

describe("US-ACH-01 facts from the own data", () => {
  it("US-ACH-01 maps specimens, measurements, courses and handovers; archived specimens stay in", async () => {
    const { facts, names } = await readAchievementFacts(sources(), "anna", "Europe/Berlin");
    expect(facts.specimens.map((s) => s.id)).toEqual(["a", "b"]);
    expect(facts.specimens[0]).toMatchObject({
      cuttingRootedOn: "2026-05-04",
      dormancy: { from: "11-01", until: "03-15" },
    });
    expect(facts.specimens[1]?.archivedOn).toBe("2026-02-01");
    expect(facts.measurements).toEqual([
      { specimenId: "a", date: "2026-03-02", quality: "healthy", hasPhoto: true },
      { specimenId: "a", date: "2026-03-09", quality: "etiolated", hasPhoto: false },
    ]);
    // One course with a done and an open date; the single treatment without course is no course.
    expect(facts.treatmentCourses).toEqual([
      { specimenId: "a", dates: [{ doneOn: "2026-02-01" }, { doneOn: null }] },
    ]);
    // 23:30 UTC on 1 July is already 2 July in Berlin (NFR-08); only finished handovers count.
    expect(facts.handovers).toEqual([{ date: "2026-07-02", specimenId: "b" }]);
    expect(names.get("a")).toBe("Aloe a");
  });

  it("US-ACH-01 a specimen whose species is unknown has no dormancy period (P-08)", async () => {
    const s = sources({
      species: { findMany: async (_u: string, ids: readonly string[]) => ids.map(() => null) },
    });
    const { facts } = await readAchievementFacts(s, "anna", "Europe/Berlin");
    expect(facts.specimens.every((x) => x.dormancy === null)).toBe(true);
  });
});

describe("US-ACH-02 overview view", () => {
  it("US-ACH-02 earned items carry the specimen name, open ones the next step with a name", async () => {
    const v = await achievementsView(
      sources(),
      "anna",
      "Europe/Berlin",
      new Date("2026-10-15T10:00:00Z"),
    );
    expect(v.calmMode).toBe(false);
    expect(v.firstStep).toBeNull();
    const care = v.groups[0];
    expect(care?.earned.map((e) => [e.id, e.specimenName])).toContainEqual([
      "cutting-rooted",
      "Aloe a",
    ]);
    expect(care?.open.find((o) => o.id === "treatment-completed")?.nextStep).toMatchObject({
      key: "treatment-completed.next",
      specimenName: "Aloe a",
    });
    expect(v.groups[2]?.earned[0]).toMatchObject({
      id: "first-handover",
      earnedOn: "2026-07-02",
      specimenName: "Aloe b",
    });
  });

  it("US-ACH-02 without data the first step is named", async () => {
    const empty = sources({
      specimens: { list: async () => [] },
      swaps: { list: async () => [] },
    });
    const v = await achievementsView(
      empty,
      "anna",
      "Europe/Berlin",
      new Date("2026-10-15T10:00:00Z"),
    );
    expect(v.earnedCount).toBe(0);
    expect(v.firstStep).toEqual({
      key: "first-measurement-photo.next",
      specimenId: null,
      specimenName: null,
    });
  });
});
