import { describe, expect, it } from "vitest";
import { speciesSchema } from "./fields";
import { LATIN_NAME_RULE as R } from "./name";
import { SPECIES_NAMING_RULE, checkSpeciesName } from "./rule";

// US-KI-13 / FR-KI-17: the naming rule a client reads up front is the rule the proposal checks.
const profile = {
  germanName: "Probe",
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 10000,
  growthMeasure: "height",
  etiolationSigns: "Streckt sich.",
  successCriteria: "Kompakt.",
};
/** What the proposal's schema makes of the name: its display form or the code of the field latinName. */
function proposal(name: string) {
  const r = speciesSchema({ ...profile, latinName: name });
  if (r.ok) return { normalized: r.value.latinName.display, code: null };
  const detail = r.error.details?.find((d) => d.field === "latinName");
  return { normalized: null, code: detail?.code ?? r.error.code };
}
const outcome = (name: string) => {
  const c = checkSpeciesName(name);
  return c.valid ? { normalized: c.normalized, code: null } : { normalized: null, code: c.code };
};
const letters = (n: number) => "a".repeat(n);

describe("US-KI-13 the catalog naming rule is discoverable and cannot drift (FR-KI-17)", () => {
  it.each(SPECIES_NAMING_RULE.examples.map((e) => [e.name, e] as const))(
    "US-KI-13 example %j: the dry check and the proposal give what the description says",
    (name, example) => {
      const expected = { normalized: example.normalized, code: example.code };
      expect(outcome(name)).toEqual(expected);
      expect(proposal(name)).toEqual(expected);
    },
  );

  it("US-KI-13 the examples cover a valid name, a hybrid sign, an addition and a placeholder", () => {
    const codes = SPECIES_NAMING_RULE.examples.map((e) => e.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        null,
        "catalog.name_hybrid",
        "catalog.name_addition",
        "input.invalid",
      ]),
    );
  });

  it("US-KI-13 every addition and every hybrid sign of the rule is refused with its code", () => {
    for (const a of R.additions)
      for (const form of [a, `${a}.`])
        expect(outcome(`Aloe vera ${form} alba`).code).toBe("catalog.name_addition");
    for (const sign of R.hybridSigns)
      expect(outcome(`Citrus ${sign} limon`).code).toBe("catalog.name_hybrid");
    expect(outcome("+Laburnocytisus adamii").code).toBe("catalog.name_hybrid");
    expect(outcome("Xanthorrhoea australis").code).toBeNull(); // starts with x, no hybrid sign
  });

  it("US-KI-13 the limits the words name are the limits the check applies", () => {
    expect(outcome(`Aloe ${letters(R.word.max)}`).code).toBeNull();
    expect(outcome(`Aloe ${letters(R.word.max + 1)}`).code).toBe("input.invalid");
    expect(outcome(`Aloe ${letters(R.word.min - 1)}`).code).toBe("input.invalid");
    expect(outcome(`Aloe vera '${letters(R.cultivar.max)}'`).code).toBeNull();
    expect(outcome(`Aloe vera '${letters(R.cultivar.max + 1)}'`).code).toBe("input.invalid");
    expect(
      outcome(
        Array(R.words + 1)
          .fill("Aloe")
          .join(" "),
      ).code,
    ).toBe("input.invalid");
    const { words, cultivar, hybrid, addition } = SPECIES_NAMING_RULE.rules;
    expect(words).toContain(`At most ${R.words} words`);
    expect(words).toContain(`${R.word.min} to ${R.word.max} characters`);
    expect(cultivar).toContain(`${R.cultivar.min} to ${R.cultivar.max} characters`);
    expect(hybrid).toContain("catalog.name_hybrid");
    for (const a of R.additions) expect(addition).toContain(`${a}.`);
  });

  it("US-KI-13 a refused name carries the code, the keeper's text and the rule it violates", () => {
    const r = checkSpeciesName("Citrus x limon");
    expect(r).toMatchObject({ valid: false, code: "catalog.name_hybrid" });
    if (r.valid) throw new Error("expected a refusal");
    expect(r.reason).toMatch(/Hybridzeichen/);
    expect(r.rule).toEqual([SPECIES_NAMING_RULE.rules.hybrid]);
    const placeholder = checkSpeciesName("Aloe sp.");
    expect(placeholder.valid ? [] : placeholder.rule).toContain(
      SPECIES_NAMING_RULE.rules.placeholder,
    );
  });

  it("US-KI-13 a valid name comes back in its normal form with genus, epithet and cultivar", () => {
    expect(checkSpeciesName("  dracaena   TRIFASCIATA 'Moonshine'")).toEqual({
      valid: true,
      name: "  dracaena   TRIFASCIATA 'Moonshine'",
      normalized: "Dracaena trifasciata 'Moonshine'",
      genus: "Dracaena",
      epithet: "trifasciata",
      cultivar: "Moonshine",
    });
  });
});
