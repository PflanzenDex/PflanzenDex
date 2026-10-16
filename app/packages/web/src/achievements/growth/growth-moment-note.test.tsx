// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GrowthMomentNote } from "./growth-moment-note";
import type { GrowthMoments } from "./use-growth-moments";

afterEach(cleanup);
const moments = (latest: GrowthMoments["latest"]): GrowthMoments => ({
  latest,
  records: new Set(),
});
const moment = (record: { ratePerYear: number } | null) =>
  moments({ kind: "moment", since: "2025-01-01", growth: 30, ratePerYear: 30, record });

describe("US-ACH-05 growth moment note", () => {
  it("US-ACH-05 shows N cm since the first measurement after saving", () => {
    render(<GrowthMomentNote moments={moment(null)} justSaved />);
    expect(screen.getByRole("status").textContent).toBe("Wachstumsmoment: 30 cm seit 01.01.2025.");
  });

  it("US-ACH-05 names a new personal record with the yearly rate", () => {
    render(<GrowthMomentNote moments={moment({ ratePerYear: 30.04 })} justSaved />);
    expect(screen.getByRole("status").textContent).toContain(
      "Neuer persönlicher Rekord: 30 cm/Jahr.",
    );
  });

  it("US-ACH-05 is not repeated at a later visit: nothing without a fresh save", () => {
    render(<GrowthMomentNote moments={moment({ ratePerYear: 30 })} justSaved={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-05 unknown says what is needed, not a record (P-08, P-09)", () => {
    render(<GrowthMomentNote moments={moments({ kind: "unknown" })} justSaved />);
    expect(screen.getByRole("status").textContent).toMatch(/unbekannt.*90 Tagen/);
    expect(document.body.textContent).not.toMatch(/Rekord/);
  });

  it("US-ACH-05 etiolated or slower growth shows nothing (US-WAC-04)", () => {
    render(<GrowthMomentNote moments={moments({ kind: "none" })} justSaved />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-08 without moments (calm mode, read error) nothing shows", () => {
    render(<GrowthMomentNote moments={null} justSaved />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
