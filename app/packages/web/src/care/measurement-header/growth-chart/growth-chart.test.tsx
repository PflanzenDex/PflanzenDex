// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { MeasurementRow } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { GrowthChart } from "./growth-chart";

afterEach(cleanup);
const m = (date: string, value: number, quality: "healthy" | "etiolated"): MeasurementRow => ({
  id: date,
  specimenId: "e1",
  date,
  value,
  quality,
  note: null,
  ratedBy: "keeper",
  photo: null,
});

describe("US-WAC-05 history chart with marking of etiolated measurements", () => {
  it("fewer than two measurements: says what is needed instead of an empty chart (P-09)", () => {
    render(<GrowthChart measurements={[m("2026-01-01", 10, "healthy")]} />);
    expect(screen.getByText(/ab der 2\. Messung/i)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws value over time in date order, newest-first input included", () => {
    render(
      <GrowthChart
        measurements={[
          m("2026-01-21", 12, "healthy"),
          m("2026-01-11", 11, "healthy"),
          m("2026-01-01", 10, "healthy"),
        ]}
      />,
    );
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toContain("3 Messungen");
    expect(chart.getAttribute("aria-label")).toContain("01.01.2026");
    expect(chart.getAttribute("aria-label")).toContain("21.01.2026");
    expect(chart.querySelectorAll("[data-point]")).toHaveLength(3);
  });

  it("marks etiolated measurements apart from healthy ones, not by colour alone", () => {
    render(
      <GrowthChart
        measurements={[
          m("2026-01-01", 10, "healthy"),
          m("2026-01-11", 12, "etiolated"),
          m("2026-01-21", 12.5, "etiolated"),
        ]}
      />,
    );
    const marked = document.querySelectorAll('[data-point="etiolated"]');
    expect(marked).toHaveLength(2);
    expect(document.querySelectorAll('[data-point="healthy"]')).toHaveLength(1);
    expect(screen.getByText(/Raute.*vergeilt/i)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("2 davon vergeilt/dünn");
  });
});
