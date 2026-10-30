import { describe, expect, it } from "vitest";
import { attributesOf, checkAttributeFact, sourcesOf, type AttributeFact } from "./index";

// US-ENT-09, DM-ENT-01, P-08: every field carries source and license; unknown stays unknown.
const evidence = {
  source: "wikipedia",
  url: "https://de.wikipedia.org/wiki/Ficus_benjamina",
  license: "CC-BY-SA-4.0",
  retrievedAt: "2026-10-17",
};
const fact = (over: Record<string, unknown> = {}, ev: Record<string, unknown> = {}) => ({
  species: "Ficus benjamina",
  field: "toxicToPets",
  value: true,
  evidence: { ...evidence, ...ev },
  ...over,
});

describe("US-ENT-09 checkAttributeFact", () => {
  it("US-ENT-09 accepts a value with source, https link, free license and date", () => {
    expect(checkAttributeFact(fact())).toEqual({ ok: true, fact: fact() });
    expect(checkAttributeFact(fact({ field: "minTemperature", value: 12.5 })).ok).toBe(true);
    expect(checkAttributeFact(fact({ field: "humidity", value: "high" })).ok).toBe(true);
  });

  it("US-ENT-09 rejects a value without a citable source, link, license or date and names every problem", () => {
    const r = checkAttributeFact(
      fact({}, { source: "ai", url: "http://x.org", license: "", retrievedAt: "17.10.2026" }),
    );
    expect(r).toEqual({
      ok: false,
      problems: [
        "attribute.source_unknown",
        "attribute.url_invalid",
        "attribute.license_missing",
        "attribute.date_invalid",
      ],
    });
    expect(
      checkAttributeFact({ species: "Ficus benjamina", field: "humidity", value: "low" }).ok,
    ).toBe(false);
  });

  it("US-ENT-09 rejects values outside the field's type or range and unknown fields", () => {
    const problem = (over: Record<string, unknown>) => {
      const r = checkAttributeFact(fact(over));
      return r.ok ? null : r.problems[0];
    };
    expect(problem({ field: "humidity", value: "wet" })).toBe("attribute.value_invalid");
    expect(problem({ field: "toxicToPets", value: "yes" })).toBe("attribute.value_invalid");
    expect(problem({ field: "minTemperature", value: 99 })).toBe("attribute.value_invalid");
    expect(problem({ field: "minTemperature", value: Number.NaN })).toBe("attribute.value_invalid");
    expect(problem({ field: "colour" })).toBe("attribute.field_unknown");
    expect(problem({ species: " " })).toBe("attribute.species_invalid");
  });

  it("US-ENT-09 rejects an impossible calendar date and a link with credentials", () => {
    expect(checkAttributeFact(fact({}, { retrievedAt: "2026-02-31" })).ok).toBe(false);
    expect(checkAttributeFact(fact({}, { url: "https://user:pw@example.org/x" })).ok).toBe(false);
  });
});

describe("US-ENT-09 lightDescription", () => {
  it("US-ENT-09: Given a light statement of the fixed value set with a citable source, then it is accepted", () => {
    for (const value of ["low", "medium", "bright_indirect", "direct_sun"])
      expect(checkAttributeFact(fact({ field: "lightDescription", value })).ok).toBe(true);
  });

  it("US-ENT-09: Given a light statement outside the value set or without a source, then it is refused with every problem", () => {
    for (const value of ["high", "sunny", "", 3, true, null])
      expect(checkAttributeFact(fact({ field: "lightDescription", value }))).toEqual({
        ok: false,
        problems: ["attribute.value_invalid"],
      });
    const r = checkAttributeFact({
      species: "Ficus benjamina",
      field: "lightDescription",
      value: "low",
    });
    expect(r.ok).toBe(false);
  });
});

describe("US-ENT-09 attributesOf", () => {
  it("US-ENT-09 leaves fields without a fact unknown (FR-ENT-04)", () => {
    const facts = [fact(), fact({ field: "humidity", value: "low" })] as unknown as AttributeFact[];
    expect(attributesOf(facts)).toEqual({
      humidity: "low",
      minTemperature: null,
      toxicToPets: true,
      growthSize: null,
      lightDescription: null,
    });
    expect(attributesOf([])).toEqual({
      humidity: null,
      minTemperature: null,
      toxicToPets: null,
      growthSize: null,
      lightDescription: null,
    });
  });

  it("US-ENT-09 reads the light statement of a source as its own attribute, not as a light zone", () => {
    const facts = [
      fact({ field: "lightDescription", value: "bright_indirect" }),
    ] as unknown as AttributeFact[];
    expect(attributesOf(facts).lightDescription).toBe("bright_indirect");
    expect(sourcesOf(facts).map((s) => [s.field, s.review])).toEqual([
      ["lightDescription", "unreviewed"],
    ]);
  });
});
