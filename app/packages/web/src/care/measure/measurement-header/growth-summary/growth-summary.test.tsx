// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { GrowthTrend } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { GrowthSummary } from "./growth-summary";

afterEach(cleanup);
const show = (growth: GrowthTrend) => render(<GrowthSummary growth={growth} />);

describe("US-WAC-03 growth rate and trend in the view", () => {
  it('zero measurements: "noch keine Messung", no rate, no trend', () => {
    show({ count: 0, ratePerYear: null, trend: null, signal: null });
    expect(screen.getByText("noch keine Messung")).toBeTruthy();
    expect(screen.queryByText(/cm\/Jahr/)).toBeNull();
  });

  it('one measurement: "1 Messung — noch keine Rate"', () => {
    show({ count: 1, ratePerYear: null, trend: null, signal: null });
    expect(screen.getByText("1 Messung — noch keine Rate")).toBeTruthy();
  });

  it("two measurements: rate in cm/year and the hint that the trend comes with the 3rd measurement", () => {
    show({ count: 2, ratePerYear: 36.5, trend: null, signal: null });
    expect(screen.getByText("36,5 cm/Jahr")).toBeTruthy();
    expect(screen.getByText("ab der 3. Messung siehst du hier einen Trend")).toBeTruthy();
  });

  it("two measurements on the same day: no rate, says why", () => {
    show({ count: 2, ratePerYear: null, trend: null, signal: null });
    expect(screen.getByText(/am selben Tag/)).toBeTruthy();
    expect(screen.queryByText(/cm\/Jahr/)).toBeNull();
  });

  it.each([
    ["faster", "schneller als dein bisheriger Schnitt"],
    ["slower", "langsamer als dein bisheriger Schnitt"],
    ["stable", "stabil"],
  ] as const)("trend %s is compared with the own average only (P-08)", (trend, text) => {
    show({ count: 3, ratePerYear: 20, trend, signal: null });
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText(/Artdurchschnitt/)).toBeNull();
  });

  it("three measurements without a usable trend: unknown, nothing invented", () => {
    show({ count: 3, ratePerYear: 20, trend: null, signal: null });
    expect(screen.getByText(/noch kein Trend/)).toBeTruthy();
  });
});

describe("US-WAC-04 etiolation overrides the trend in the view", () => {
  it("etiolated last measurement: says so instead of the trend, the rate stays", () => {
    show({ count: 3, ratePerYear: 20, trend: "faster", signal: "etiolated" });
    expect(screen.getByText(/Wuchs vergeilt\/dünn — trotz Rate kein Erfolgssignal/)).toBeTruthy();
    expect(screen.getByText("20 cm/Jahr")).toBeTruthy();
    expect(screen.queryByText(/schneller/)).toBeNull();
  });

  it("etiolated even with a single measurement", () => {
    show({ count: 1, ratePerYear: null, trend: null, signal: "etiolated" });
    expect(screen.getByText(/kein Erfolgssignal/)).toBeTruthy();
  });

  it("faster and healthy: success signal", () => {
    show({ count: 3, ratePerYear: 20, trend: "faster", signal: "success" });
    expect(
      screen.getByText(/schneller als dein bisheriger Schnitt \(Erfolgssignal\)/),
    ).toBeTruthy();
  });
});
