import { describe, expect, it } from "vitest";
import { attributesOf, checkAttributeFact, type AttributeFact } from "./index";

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

describe("US-ENT-09 attributesOf", () => {
  it("US-ENT-09 leaves fields without a fact unknown (FR-ENT-04)", () => {
    const facts = [fact(), fact({ field: "humidity", value: "low" })] as unknown as AttributeFact[];
    expect(attributesOf(facts)).toEqual({
      humidity: "low",
      minTemperature: null,
      toxicToPets: true,
      growthSize: null,
    });
    expect(attributesOf([])).toEqual({
      humidity: null,
      minTemperature: null,
      toxicToPets: null,
      growthSize: null,
    });
  });
});
