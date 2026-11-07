import { describe, expect, it, vi } from "vitest";
import { InMemoryImportSpecies } from "../../../shared/test-helpers";
import type { SpeciesCandidate } from "../../types";
import { matchSpecies } from "./species";

// US-BES-18: a species of the file is ready only on an exact name or synonym, ignoring case and accents; the import never
// guesses (P-08). Partial or several matches are candidates the keeper chooses from.
const cand = (
  id: string,
  latinName: string,
  germanName: string | null,
  synonyms: string[] = [],
): SpeciesCandidate => ({ id, latinName, germanName, synonyms });

const MONSTERA = "11111111-1111-4111-8111-111111111111";
const FUSS = "22222222-2222-4222-8222-222222222222";
const BOGEN_A = "33333333-3333-4333-8333-333333333333";
const BOGEN_B = "44444444-4444-4444-8444-444444444444";
const PRIVATE = "55555555-5555-4555-8555-555555555555";

const source = () =>
  new InMemoryImportSpecies([
    { species: cand(MONSTERA, "Monstera deliciosa", "Fensterblatt", ["Philodendron pertusum"]) },
    { species: cand(FUSS, "Ficus lyrata", "Fußpflanze") },
    { species: cand(BOGEN_A, "Dracaena trifasciata", "Bogenhanf") },
    { species: cand(BOGEN_B, "Sansevieria trifasciata", "Bogenhanf") },
    { species: cand(PRIVATE, "Hoya kerrii", "Herzblatt"), only: "ben" },
  ]);

describe("US-BES-18 species of an import row: exact names only", () => {
  it("US-BES-18 an exact Latin name makes the row ready", async () => {
    expect(await matchSpecies(source(), "anna", "Monstera deliciosa")).toMatchObject({
      kind: "ready",
      species: { id: MONSTERA },
    });
  });

  it("US-BES-18 case and accents do not matter for an exact name", async () => {
    expect(await matchSpecies(source(), "anna", "  MONSTÉRA   deliciosa ")).toMatchObject({
      kind: "ready",
      species: { id: MONSTERA },
    });
  });

  it("US-BES-18 an exact synonym makes the row ready, a German name too", async () => {
    expect(await matchSpecies(source(), "anna", "Philodendron pertusum")).toMatchObject({
      kind: "ready",
      species: { id: MONSTERA },
    });
    expect(await matchSpecies(source(), "anna", "Fensterblatt")).toMatchObject({
      kind: "ready",
      species: { id: MONSTERA },
    });
  });

  it("US-BES-18 a partial name is never ready; it is a candidate", async () => {
    const r = await matchSpecies(source(), "anna", "Monstera");
    expect(r).toMatchObject({ kind: "candidates", more: false });
    expect(r.kind === "candidates" && r.candidates.map((c) => c.id)).toEqual([MONSTERA]);
  });

  it("US-BES-18 several exact matches are candidates, nothing is chosen", async () => {
    const r = await matchSpecies(source(), "anna", "Bogenhanf");
    expect(r.kind).toBe("candidates");
    expect(r.kind === "candidates" && r.candidates.map((c) => c.id).sort()).toEqual(
      [BOGEN_A, BOGEN_B].sort(),
    );
  });

  it("US-BES-18 a name without a hit is refused as none, with no candidates", async () => {
    expect(await matchSpecies(source(), "anna", "Kaktusxyz")).toEqual({ kind: "none" });
  });

  it("US-BES-18 an empty name is empty; a text without letters or digits never lists the catalog", async () => {
    const src = source();
    const search = vi.spyOn(src, "search");
    expect(await matchSpecies(src, "anna", "")).toEqual({ kind: "absent" });
    expect(await matchSpecies(src, "anna", "!!! ---")).toEqual({ kind: "none" });
    expect(search).not.toHaveBeenCalled();
  });

  it("US-BES-18 the catalog's own match is confirmed with the names themselves: 'Fusspflanze' is not 'Fußpflanze'", async () => {
    // The catalog normalizes ß to ss, so the lookup finds the species; the row still needs the names to match exactly.
    const r = await matchSpecies(source(), "anna", "Fusspflanze");
    expect(r.kind).toBe("candidates");
    expect(r.kind === "candidates" && r.candidates.map((c) => c.id)).toEqual([FUSS]);
  });

  it("US-BES-18 only the species the account sees count (P-04): a private proposal is no hit for another keeper", async () => {
    expect(await matchSpecies(source(), "anna", "Herzblatt")).toEqual({ kind: "none" });
    expect(await matchSpecies(source(), "ben", "Herzblatt")).toMatchObject({
      kind: "ready",
      species: { id: PRIVATE },
    });
  });

  it("US-BES-18 more matches than the candidate cap say so (FR-BES-24, the cap of candidates)", async () => {
    const many = new InMemoryImportSpecies(
      Array.from({ length: 25 }, (_, i) => ({
        species: cand(
          `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`,
          `Pflanze ${i}`,
          null,
        ),
      })),
    );
    const r = await matchSpecies(many, "anna", "Pflanze");
    expect(r).toMatchObject({ kind: "candidates", more: true });
    expect(r.kind === "candidates" && r.candidates).toHaveLength(20);
  });
});
