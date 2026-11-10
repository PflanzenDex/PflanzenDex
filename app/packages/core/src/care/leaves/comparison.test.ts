import { describe, expect, it } from "vitest";
import { compareLeaves } from "./comparison";
import type { LeafRow } from "./types";

// Leaves of one plant as the store sends them (createdAt is a fixed-width UTC timestamp, so it sorts as text).
const leaf = (
  id: string,
  date: string,
  lengthMm: number | null,
  widthMm: number | null = null,
  createdAt = `${date}T08:00:00.000000Z`,
): LeafRow => ({ id, specimenId: "plant-1", date, lengthMm, widthMm, note: null, createdAt });

describe("US-WAC-07 the newest leaf against the last earlier leaf with the same measure", () => {
  it("US-WAC-07 without leaves or with one leaf there is nothing to compare (P-08)", () => {
    expect(compareLeaves([])).toBeNull();
    expect(compareLeaves([leaf("a", "2026-10-01", 40, 12)])).toBeNull();
  });

  it.each([
    [40, 30, "larger"],
    [30, 40, "smaller"],
    [30, 30, "same"],
  ] as const)("US-WAC-07 length %i against an earlier %i says %s", (newest, earlier, direction) => {
    expect(
      compareLeaves([leaf("a", "2026-10-01", earlier), leaf("b", "2026-10-08", newest)]),
    ).toEqual({ measure: "length", direction });
  });

  it("US-WAC-07 compares with the last earlier leaf that has a length, skipping leaves without one", () => {
    const leaves = [
      leaf("a", "2026-10-01", 20),
      leaf("b", "2026-10-08", null, 9),
      leaf("c", "2026-10-15", 30),
      leaf("d", "2026-10-22", 25),
    ];
    expect(compareLeaves(leaves)).toEqual({ measure: "length", direction: "smaller" });
  });

  it("US-WAC-07 the width is compared when the newest leaf has no length", () => {
    const leaves = [leaf("a", "2026-10-01", 40, 10), leaf("b", "2026-10-08", null, 12)];
    expect(compareLeaves(leaves)).toEqual({ measure: "width", direction: "larger" });
  });

  it("US-WAC-07 the width is compared when no earlier leaf has a length", () => {
    const leaves = [leaf("a", "2026-10-01", null, 10), leaf("b", "2026-10-08", 40, 10)];
    expect(compareLeaves(leaves)).toEqual({ measure: "width", direction: "same" });
  });

  it("US-WAC-07 length and width are never compared with each other", () => {
    // Newest has a length, the earlier leaf only a width: no comparison at all.
    expect(
      compareLeaves([leaf("a", "2026-10-01", null, 30), leaf("b", "2026-10-08", 40)]),
    ).toBeNull();
    // Newest has only a width, the earlier leaf only a length: no comparison at all.
    expect(
      compareLeaves([leaf("a", "2026-10-01", 50), leaf("b", "2026-10-08", null, 10)]),
    ).toBeNull();
  });

  it("US-WAC-07 no comparison when the newest leaf has no size (P-08)", () => {
    const leaves = [leaf("a", "2026-10-01", 40, 12), leaf("b", "2026-10-08", null, null)];
    expect(compareLeaves(leaves)).toBeNull();
  });

  it("US-WAC-07 no comparison when no earlier leaf has the same measure", () => {
    expect(
      compareLeaves([leaf("a", "2026-10-01", null), leaf("b", "2026-10-08", null)]),
    ).toBeNull();
  });

  it("US-WAC-07 two leaves on one date: the one created last is the newest", () => {
    const morning = leaf("a", "2026-10-08", 30, null, "2026-10-08T07:00:00.000000Z");
    const evening = leaf("b", "2026-10-08", 36, null, "2026-10-08T19:00:00.000000Z");
    expect(compareLeaves([morning, evening])).toEqual({ measure: "length", direction: "larger" });
    expect(compareLeaves([evening, morning])).toEqual({ measure: "length", direction: "larger" });
  });

  it("US-WAC-07 the result does not depend on the order the leaves arrive in", () => {
    const leaves = [
      leaf("a", "2026-09-01", 10),
      leaf("b", "2026-10-01", 20),
      leaf("c", "2026-10-15", 15),
    ];
    const reversed = [...leaves].reverse();
    expect(compareLeaves(reversed)).toEqual(compareLeaves(leaves));
    expect(compareLeaves(leaves)).toEqual({ measure: "length", direction: "smaller" });
  });
});
