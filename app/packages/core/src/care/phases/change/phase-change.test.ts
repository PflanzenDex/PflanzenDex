import { describe, expect, it } from "vitest";
import { phaseChangeOccasions } from "./phase-change";
import type { PhasesRow } from "../phases";

const row = (over: Partial<PhasesRow> = {}): PhasesRow => ({
  specimenId: "s1",
  name: "Ficus",
  speciesId: "sp1",
  phase: "dormancy",
  locationId: "summer",
  targetLocationId: "winter",
  nextChange: { date: "2026-11-01", phase: "dormancy", days: 0 },
  ...over,
});

describe("US-MON-02 reminder at the phase change", () => {
  it("US-MON-02 the dormancy begins today and the specimen stands at the old location: one occasion", () => {
    const [o, ...rest] = phaseChangeOccasions([row()]);
    expect(rest).toEqual([]);
    expect(o).toMatchObject({ id: "phase_change:s1:2026-11-01", occasion: "phase" });
    expect(o?.text).toBe(
      "„Ficus“: heute beginnt die Ruhephase, das Exemplar steht noch am alten Standort.",
    );
    expect(o?.nextAction).toContain("Jetzt umgestellt");
  });

  it("US-MON-02 the dormancy ends today (the growth phase begins) and the location is still the winter one", () => {
    const [o] = phaseChangeOccasions([
      row({
        phase: "growth",
        locationId: "winter",
        targetLocationId: "summer",
        nextChange: { date: "2027-03-16", phase: "growth", days: 0 },
      }),
    ]);
    expect(o?.text).toContain("heute beginnt die Wachstumsphase");
  });

  it("US-MON-02 nothing when the specimen already stands at the new location", () => {
    expect(phaseChangeOccasions([row({ locationId: "winter" })])).toEqual([]);
  });

  it("US-MON-02 nothing on any other day than the change", () => {
    expect(
      phaseChangeOccasions([
        row({ nextChange: { date: "2026-11-02", phase: "dormancy", days: 1 } }),
      ]),
    ).toEqual([]);
    expect(phaseChangeOccasions([row({ nextChange: null })])).toEqual([]);
  });

  it("US-MON-02 an unknown target or an unknown location is no 'old location' (P-08)", () => {
    expect(phaseChangeOccasions([row({ targetLocationId: null })])).toEqual([]);
    expect(phaseChangeOccasions([row({ locationId: null })])).toEqual([]);
  });

  it("US-MON-02 uses the same deviation rule as the phase list (FR-MON-03)", () => {
    const rows = [row(), row({ specimenId: "s2", name: "Aloe", locationId: "winter" })];
    expect(phaseChangeOccasions(rows).map((o) => o.id)).toEqual(["phase_change:s1:2026-11-01"]);
  });
});
