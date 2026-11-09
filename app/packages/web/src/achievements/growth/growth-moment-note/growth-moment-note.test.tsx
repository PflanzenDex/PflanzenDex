// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { growthNoteText } from "./growth-moment-note";
import type { GrowthMoments } from "../use-growth-moments";

const moments = (latest: GrowthMoments["latest"]): GrowthMoments => ({
  latest,
  records: new Set(),
});
const moment = (record: { ratePerYear: number } | null) =>
  moments({ kind: "moment", since: "2025-01-01", growth: 30, ratePerYear: 30, record });

describe("US-ACH-05 growth moment note", () => {
  it("US-ACH-05 shows N cm since the first measurement after saving", () => {
    expect(growthNoteText({ moments: moment(null), justSaved: true })).toBe(
      "Wachstumsmoment: 30 cm seit 01.01.2025.",
    );
  });

  it("US-ACH-05 names a new personal record with the yearly rate", () => {
    expect(growthNoteText({ moments: moment({ ratePerYear: 30.04 }), justSaved: true })).toContain(
      "Neuer persönlicher Rekord: 30 cm/Jahr.",
    );
  });

  it("US-ACH-05 is not repeated at a later visit: nothing without a fresh save", () => {
    expect(growthNoteText({ moments: moment({ ratePerYear: 30 }), justSaved: false })).toBeNull();
  });

  it("US-ACH-05 unknown says what is needed, not a record (P-08, P-09)", () => {
    const text = growthNoteText({ moments: moments({ kind: "unknown" }), justSaved: true });
    expect(text).toMatch(/unbekannt.*90 Tagen/);
    expect(text).not.toMatch(/Rekord/);
  });

  it("US-ACH-05 etiolated or slower growth shows nothing (US-WAC-04)", () => {
    expect(growthNoteText({ moments: moments({ kind: "none" }), justSaved: true })).toBeNull();
  });

  it("US-ACH-08 without moments (calm mode, read error) nothing shows", () => {
    expect(growthNoteText({ moments: null, justSaved: true })).toBeNull();
  });
});
