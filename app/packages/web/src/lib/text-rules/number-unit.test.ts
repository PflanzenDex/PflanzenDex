import { describe, expect, it } from "vitest";
import { keepTogether, valueText, withUnit } from "../format";

const NBSP = " ";

describe("US-QS-24 number and unit never break apart", () => {
  it("US-QS-24 keepTogether joins number and unit with a non-breaking space", () => {
    expect(keepTogether("seit 10 Tagen")).toBe(`seit 10${NBSP}Tagen`);
    expect(keepTogether("12,5 cm und 30.000 Lux")).toBe(`12,5${NBSP}cm und 30.000${NBSP}Lux`);
    expect(keepTogether("ab 50 % Bedarf, 140 kB")).toBe(`ab 50${NBSP}% Bedarf, 140${NBSP}kB`);
  });

  it("US-QS-24 keepTogether keeps a date range together", () => {
    expect(keepTogether("03.10.2026 – 05.10.2026")).toBe(`03.10.2026${NBSP}–${NBSP}05.10.2026`);
  });

  it("US-QS-24 keepTogether leaves words that only start like a unit alone", () => {
    expect(keepTogether("3 Tagesziele")).toBe("3 Tagesziele");
  });

  it("US-QS-24 withUnit and valueText format the number the German way", () => {
    expect(withUnit(30000, "Lux")).toBe(`30.000${NBSP}Lux`);
    expect(valueText(12.5)).toBe(`12,5${NBSP}cm`);
  });
});
