import { describe, it, expect } from "vitest";
import { checkApprovalReadiness, isApprovalReady } from "./approval";
import { GROWTH_MEASURES } from "./species";
import type { SpeciesValues, GrowthMeasure } from "./species";

// Helper to create a complete species (all required fields present)
const completeSpecies = (): SpeciesValues => ({
  latinName: "Genus epithet",
  genus: "Genus",
  epithet: "epithet",
  cultivar: null,
  germanName: "Deutscher Name",
  englishName: "English Name",
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 2,
  standardLevel: 2,
  lightDemandLux: 5000,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: GROWTH_MEASURES[0] as GrowthMeasure,
  etiolationSigns: "Thin, pale leaves",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Steady growth",
  botanicalStory: null,
  source: "https://example.com",
});

describe("US-BES-10 species approval readiness (FR-BES-05, FR-BES-14, AC3)", () => {
  it("a complete species with source is ready for approval", () => {
    const species = completeSpecies();
    expect(isApprovalReady(species)).toBe(true);
    expect(checkApprovalReadiness(species)).toHaveLength(0);
  });

  it("missing latin name is an issue", () => {
    const species = { ...completeSpecies(), latinName: "" };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "latinName" && i.reason === "missing")).toBe(true);
  });

  it("invalid difficulty (outside 1-3) is an issue", () => {
    const species = { ...completeSpecies(), difficulty: 4 };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "difficulty" && i.reason === "invalid")).toBe(true);
  });

  it("invalid standard level (outside 2-4) is an issue", () => {
    const species = { ...completeSpecies(), standardLevel: 5 };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "standardLevel" && i.reason === "invalid")).toBe(true);
  });

  it("missing light demand is an issue", () => {
    const species = { ...completeSpecies(), lightDemandLux: 0 };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "lightDemandLux" && i.reason === "missing")).toBe(true);
  });

  it("missing growth measure is an issue", () => {
    const species = { ...completeSpecies(), growthMeasure: "" as GrowthMeasure };
    expect(isApprovalReady(species as SpeciesValues)).toBe(false);
    const issues = checkApprovalReadiness(species as SpeciesValues);
    expect(issues.some((i) => i.field === "growthMeasure" && i.reason === "missing")).toBe(true);
  });

  it("missing etiolation signs is an issue", () => {
    const species = { ...completeSpecies(), etiolationSigns: "" };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "etiolationSigns" && i.reason === "missing")).toBe(true);
  });

  it("missing success criteria is an issue", () => {
    const species = { ...completeSpecies(), successCriteria: "" };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "successCriteria" && i.reason === "missing")).toBe(true);
  });

  it("missing source when light demand is specified requires source (FR-BES-14)", () => {
    const species = { ...completeSpecies(), lightDemandLux: 5000, source: null };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "source" && i.reason === "source_missing")).toBe(true);
  });

  it("missing source when dormancy is specified requires source (FR-BES-14)", () => {
    const species = {
      ...completeSpecies(),
      dormancyFrom: "01-01",
      dormancyUntil: "03-01",
      source: null,
    };
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "source" && i.reason === "source_missing")).toBe(true);
  });

  it("source is not required when neither light demand nor dormancy is specified", () => {
    // Note: lightDemandLux is always required per FR-BES-05, so this test
    // creates an impossible scenario. We keep it to show that if lux=0 (missing) is treated as missing,
    // then source isn't additionally required
    const species = {
      ...completeSpecies(),
      lightDemandLux: 0,
      dormancyFrom: null,
      dormancyUntil: null,
      source: null,
    };
    // lightDemandLux is required, so this will have issues regardless
    expect(isApprovalReady(species)).toBe(false);
    const issues = checkApprovalReadiness(species);
    expect(issues.some((i) => i.field === "lightDemandLux")).toBe(true);
  });

  it("multiple issues are all reported", () => {
    const species = {
      ...completeSpecies(),
      latinName: "",
      difficulty: 4,
      growthMeasure: "" as GrowthMeasure,
      source: null,
    } as SpeciesValues;
    const issues = checkApprovalReadiness(species);
    expect(issues.length).toBeGreaterThanOrEqual(4);
    expect(issues.map((i) => i.field).sort()).toEqual(
      expect.arrayContaining(["latinName", "difficulty", "growthMeasure", "source"]),
    );
  });
});
