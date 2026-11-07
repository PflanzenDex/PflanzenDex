import { describe, expect, it } from "vitest";
import { normalizeName, referenceError, resolveName, type Named, type Resolution } from "./naming";

const item = (id: string, ...names: string[]): Named => ({ id, label: names[0] ?? id, names });
const specimens = [
  item("a", "Aloe vera – blau"),
  item("b", "Aloe vera – rot"),
  item("c", "Monstera deliciosa"),
];
const ID = "0A1B2C3D-0000-4000-8000-000000000001";

describe("US-KI-11 names instead of ids (FR-KI-15)", () => {
  it("US-KI-11 case, accents, dashes and brackets do not matter", () => {
    expect(normalizeName("Aloe vera (Blau)")).toBe(normalizeName("aloe  VERA – blau"));
    expect(normalizeName("Bégonia")).toBe("begonia");
  });

  it("US-KI-11 one hit is used: an exact name, or the only name that contains the reference", () => {
    expect(resolveName(specimens, "Aloe vera (blau)")).toEqual({ kind: "found", id: "a" });
    expect(resolveName(specimens, "monstera")).toEqual({ kind: "found", id: "c" });
  });

  it("US-KI-11 an id is taken as it is; the read behind it decides whether the account has it", () => {
    expect(resolveName([], ID)).toEqual({ kind: "found", id: ID.toLowerCase() });
  });

  it("US-KI-11 several hits return the candidates and nothing is chosen (KI-R4)", () => {
    expect(resolveName(specimens, "Aloe vera")).toEqual({
      kind: "ambiguous",
      candidates: [
        { id: "a", name: "Aloe vera – blau" },
        { id: "b", name: "Aloe vera – rot" },
      ],
      more: false,
    });
  });

  it("US-KI-11 an exact name wins over names that only contain it", () => {
    const zones = [item("z1", "Regal"), item("z2", "Regal 2")];
    expect(resolveName(zones, "regal")).toEqual({ kind: "found", id: "z1" });
  });

  it("US-KI-11 no hit is not_found with at most 5 nearest names, nearest first", () => {
    const many = ["Regal 1", "Regal 2", "Regal 3", "Regal 4", "Regal 5", "Regal 6", "Fenster"].map(
      (n, i) => item(String(i), n),
    );
    const r = resolveName(many, "Regl 2");
    expect(r.kind).toBe("none");
    if (r.kind !== "none") return;
    expect(r.nearest).toHaveLength(5);
    expect(r.nearest[0]).toBe("Regal 2");
    expect(r.nearest).not.toContain("Fenster");
  });

  it("US-KI-11 the refusal carries a stable code with the candidates or the nearest names", () => {
    const amb = referenceError(
      { kind: "ambiguous", candidates: [{ id: "a", name: "A" }], more: false },
      "specimen",
      "specimen.not_found",
    );
    expect(amb).toMatchObject({
      code: "ai.reference_ambiguous",
      data: { field: "specimen", candidates: [{ id: "a", name: "A" }], more: false },
    });
    const none = referenceError({ kind: "none", nearest: ["B"] }, "location", "location.not_found");
    expect(none).toMatchObject({ code: "location.not_found", data: { nearest: ["B"] } });
  });
});

describe("FR-KI-15 candidates say when more match than they list", () => {
  const candidatesOf = (r: Resolution) => (r.kind === "ambiguous" ? r.candidates : []);
  const regals = (n: number) => Array.from({ length: n }, (_, i) => item(String(i), `Regal ${i}`));

  it("FR-KI-15 21 hits: 20 candidates and more true", () => {
    const r = resolveName(regals(21), "Regal");
    expect(r).toMatchObject({ kind: "ambiguous", more: true });
    expect(candidatesOf(r)).toHaveLength(20);
  });

  it("FR-KI-15 exactly 20 hits: 20 candidates and more false (the boundary)", () => {
    const r = resolveName(regals(20), "Regal");
    expect(r).toMatchObject({ kind: "ambiguous", more: false });
    expect(candidatesOf(r)).toHaveLength(20);
  });

  it("FR-KI-15 partial hits with a cut pool: more true, even with few hits", () => {
    expect(resolveName(specimens, "Aloe vera", true)).toMatchObject({
      kind: "ambiguous",
      more: true,
    });
  });

  it("FR-KI-15 exact hits with a cut pool: more false", () => {
    const twins = [item("x", "Regal"), item("y", "Regal")];
    expect(resolveName(twins, "regal", true)).toMatchObject({ kind: "ambiguous", more: false });
  });

  it("FR-KI-15 one partial hit with a cut pool: ambiguous with that one candidate and more true, not found", () => {
    expect(resolveName([item("m", "Monstera deliciosa")], "monstera", true)).toEqual({
      kind: "ambiguous",
      candidates: [{ id: "m", name: "Monstera deliciosa" }],
      more: true,
    });
  });

  it("FR-KI-15 one exact hit with a cut pool: found", () => {
    expect(resolveName(specimens, "Monstera deliciosa", true)).toEqual({ kind: "found", id: "c" });
  });

  it("FR-KI-15 one partial hit with a complete pool: found", () => {
    expect(resolveName(specimens, "monstera", false)).toEqual({ kind: "found", id: "c" });
  });

  it("FR-KI-15 the refusal carries more in its data", () => {
    const amb = referenceError(
      { kind: "ambiguous", candidates: [{ id: "a", name: "A" }], more: true },
      "species",
      "species.not_found",
    );
    expect(amb).toMatchObject({
      code: "ai.reference_ambiguous",
      data: { field: "species", more: true },
    });
  });
});
