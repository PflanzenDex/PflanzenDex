import { describe, expect, it } from "vitest";
import type { FactSources } from "../facts";
import { achievementsYear, parseYear } from "./year";

// US-ACH-07: the year in review from the own data through the ports (fakes, no database).
const specimen = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  speciesId: "sp1",
  name: `Aloe ${id}`,
  caughtAt: "2025-10-01",
  archivedAt: null,
  repottedAt: null,
  ...extra,
});
const row = (id: string, date: string, value: number, photo: string | null = null) => ({
  id,
  date,
  value,
  quality: "healthy",
  photo,
});
const src = {
  specimens: { list: async () => [specimen("a", { caughtAt: "2026-02-01" }), specimen("b")] },
  species: {
    find: async () => null,
    findMany: async (_u: string, ids: readonly string[]) => ids.map(() => null),
  },
  profiles: { list: async () => [] },
  treatments: { open: async () => new Map(), done: async () => [] },
  measurements: {
    list: async (_u: string, id: string) =>
      id === "a"
        ? [row("m1", "2026-01-10", 10, "p1"), row("m2", "2026-09-10", 18, "p2")]
        : [row("m3", "2025-05-01", 3)],
  },
  swaps: { list: async () => [] },
} as unknown as FactSources;
const who = { userId: "anna", timeZone: "Europe/Berlin", now: new Date("2026-10-17T10:00:00Z") };

describe("US-ACH-07 year in review through the API logic", () => {
  it("US-ACH-07 answers counted facts of the year with the photo pair as private image paths", async () => {
    const r = await achievementsYear(src, who, 2026);
    expect(r.calmMode).toBe(false);
    expect(r.counts).toMatchObject({ speciesCaught: 1, measurements: 2, handovers: 0 });
    expect(r.growth).toMatchObject({ specimenId: "a", growth: 8 });
    expect(r.photos?.urls).toEqual({
      first: "/specimens/a/measurements/m1/photo",
      last: "/specimens/a/measurements/m2/photo",
    });
  });

  it("US-ACH-07 another year only counts its own events and shows unknown growth", async () => {
    const r = await achievementsYear(src, who, 2025);
    expect(r.counts).toMatchObject({ speciesCaught: 1, measurements: 1 });
    expect(r.growth).toBeNull();
    expect(r.photos).toBeNull();
  });

  it("US-ACH-07 the year parameter defaults to the running year and refuses future or malformed years", () => {
    expect(parseYear(undefined, "2026-10-17")).toBe(2026);
    expect(parseYear("2025", "2026-10-17")).toBe(2025);
    expect(parseYear("2027", "2026-10-17")).toBeNull();
    expect(parseYear("abc", "2026-10-17")).toBeNull();
    expect(parseYear("1999", "2026-10-17")).toBeNull();
  });
});
