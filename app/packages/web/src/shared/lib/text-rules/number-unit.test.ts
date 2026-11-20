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

describe("US-QS-32 a zone name and its number never break apart (SG-FMT-04, SG-TYPE-07)", () => {
  it("US-QS-32 keepTogether joins 'Zone' or 'Lampe' with its number", () => {
    expect(keepTogether("Zone 2 braucht Nachschub")).toBe(`Zone${NBSP}2 braucht Nachschub`);
    expect(keepTogether("Lampe 2 links")).toBe(`Lampe${NBSP}2 links`);
    expect(keepTogether("Zone 12")).toBe(`Zone${NBSP}12`);
  });

  it("US-QS-32 keepTogether joins the cutting light's number, the bracket after it keeps its space", () => {
    expect(keepTogether("Zone 1 (Stecklingslicht)")).toBe(`Zone${NBSP}1 (Stecklingslicht)`);
  });

  it("US-QS-32 keepTogether leaves a word that only ends in a number alone", () => {
    expect(keepTogether("Zone 2er Regal")).toBe("Zone 2er Regal");
    expect(keepTogether("Regal Zone")).toBe("Regal Zone");
  });

  it("US-QS-32 keepTogether joins the zone number in a warning sentence and leaves the count to core", () => {
    expect(keepTogether("Zone 3 braucht Nachschub (1 offener Kandidat).")).toBe(
      `Zone${NBSP}3 braucht Nachschub (1 offener Kandidat).`,
    );
  });
});
