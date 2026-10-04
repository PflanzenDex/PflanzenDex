// US-LIC-03: light overview with position recommendations.
import { describe, it, expect } from "vitest";
import { lightOverview } from "./light-overview";
import type { SpecimenRow } from "./types";
import type { Species } from "../catalog";
import type { LightZone } from "../light";

const defaultZones: LightZone[] = [
  { id: "z1", name: "Cutting Light", luxCeiling: 1500, ppfd: null, sortOrder: 0 },
  { id: "z2", name: "Lamp 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 },
  { id: "z3", name: "Lamp 3", luxCeiling: 100000, ppfd: 1600, sortOrder: 2 },
  { id: "z4", name: "Lamp 4", luxCeiling: 110000, ppfd: 2000, sortOrder: 3 },
];

describe("US-LIC-03: light overview", () => {
  it("returns empty rows when there are no specimens", async () => {
    const deps = {
      specimens: { list: async () => [] },
      species: { find: async () => null },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(0);
  });

  it("returns empty rows when there are only archived specimens", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "Archived Plant",
        marker: null,
        locationId: null,
        status: "archived",
        caughtAt: null,
        archivedAt: "2024-10-01",
        archivedReason: "died",
      },
    ];

    const species1: Species = {
      id: "sp1",
      latinName: "Monstera deliciosa",
      genus: "Monstera",
      epithet: "deliciosa",
      cultivar: null,
      germanName: "Fensterblatt",
      englishName: "Swiss Cheese Plant",
      synonyms: [],
      familyGerman: "Araceae",
      familyLatin: "Araceae",
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: 15000,
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "pale leaves",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "grows",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    };

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => (id === "sp1" ? species1 : null),
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(0);
  });

  it("skips species without lux demand set", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "Test Plant",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
    ];

    const species1: Species = {
      id: "sp1",
      latinName: "Unknown Plant",
      genus: "Unknown",
      epithet: null,
      cultivar: null,
      germanName: null,
      englishName: null,
      synonyms: [],
      familyGerman: null,
      familyLatin: null,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: null as unknown as number, // No lux demand
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    };

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => (id === "sp1" ? species1 : null),
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(0);
  });

  it("creates rows for species with active specimens and lux demand", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "My Monstera",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
    ];

    const species1: Species = {
      id: "sp1",
      latinName: "Monstera deliciosa",
      genus: "Monstera",
      epithet: "deliciosa",
      cultivar: null,
      germanName: "Fensterblatt",
      englishName: "Swiss Cheese Plant",
      synonyms: [],
      familyGerman: "Araceae",
      familyLatin: "Araceae",
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: 15000,
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "pale leaves",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "grows",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    };

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => (id === "sp1" ? species1 : null),
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      speciesId: "sp1",
      speciesName: "Monstera deliciosa",
      lightDemandLux: 15000,
      position: expect.objectContaining({ category: "very_close" }),
    });
  });

  it("sorts rows descending by lux demand", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "s1",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s2",
        speciesId: "sp2",
        name: "s2",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s3",
        speciesId: "sp3",
        name: "s3",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
    ];

    const species1: Species = {
      id: "sp1",
      latinName: "Low Light Plant",
      genus: "Low",
      epithet: null,
      cultivar: null,
      germanName: null,
      englishName: null,
      synonyms: [],
      familyGerman: null,
      familyLatin: null,
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: 1000,
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    };

    const species2: Species = {
      ...species1,
      id: "sp2",
      latinName: "Medium Light Plant",
      lightDemandLux: 50000,
    };

    const species3: Species = {
      ...species1,
      id: "sp3",
      latinName: "High Light Plant",
      lightDemandLux: 100000,
    };

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => {
          if (id === "sp1") return species1;
          if (id === "sp2") return species2;
          if (id === "sp3") return species3;
          return null;
        },
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.lightDemandLux).toBe(100000);
    expect(result.rows[1]?.lightDemandLux).toBe(50000);
    expect(result.rows[2]?.lightDemandLux).toBe(1000);
  });

  it("uses species name (latin) for display", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "s1",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
    ];

    const species1: Species = {
      id: "sp1",
      latinName: "Monstera deliciosa",
      genus: "Monstera",
      epithet: "deliciosa",
      cultivar: null,
      germanName: "Fensterblatt",
      englishName: "Swiss Cheese Plant",
      synonyms: [],
      familyGerman: "Araceae",
      familyLatin: "Araceae",
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: 25000,
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "pale leaves",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "grows",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    };

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => (id === "sp1" ? species1 : null),
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows[0]?.speciesName).toBe("Monstera deliciosa");
  });

  it("maps position categories correctly based on lux demand thresholds", async () => {
    const specimens: SpecimenRow[] = [
      {
        id: "s1",
        speciesId: "sp1",
        name: "s1",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s2",
        speciesId: "sp2",
        name: "s2",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s3",
        speciesId: "sp3",
        name: "s3",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s4",
        speciesId: "sp4",
        name: "s4",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
      {
        id: "s5",
        speciesId: "sp5",
        name: "s5",
        marker: null,
        locationId: null,
        status: "plant",
        caughtAt: null,
        archivedAt: null,
        archivedReason: null,
      },
    ];

    const createSpecies = (id: string, lux: number): Species => ({
      id,
      latinName: `Plant ${lux}`,
      genus: "Test",
      epithet: null,
      cultivar: null,
      germanName: null,
      englishName: null,
      synonyms: [],
      familyGerman: null,
      familyLatin: null,
      difficulty: 1,
      standardLevel: 2,
      lightDemandLux: lux,
      dormancyFrom: null,
      dormancyUntil: null,
      locationHint: null,
      growthMeasure: "height",
      etiolationSigns: "",
      wateringHint: null,
      substrate: null,
      pruning: null,
      growthHacks: null,
      successCriteria: "",
      botanicalStory: null,
      source: null,
      reviewStatus: "reviewed",
      createdBy: "operator",
      own: false,
      version: 1,
    });

    const deps = {
      specimens: { list: async () => specimens },
      species: {
        find: async (userId: string, id: string) => {
          if (id === "sp1") return createSpecies("sp1", 60000); // directly_under_lamp
          if (id === "sp2") return createSpecies("sp2", 20000); // very_close
          if (id === "sp3") return createSpecies("sp3", 10000); // close
          if (id === "sp4") return createSpecies("sp4", 6000); // medium_distance
          if (id === "sp5") return createSpecies("sp5", 2000); // further_away
          return null;
        },
      },
      zones: { list: async () => defaultZones },
    };

    const result = await lightOverview(deps, "user1");
    expect(result.rows).toHaveLength(5);

    // Check that rows are sorted descending by lux and have correct position categories
    expect(result.rows[0]?.position.category).toBe("directly_under_lamp");
    expect(result.rows[1]?.position.category).toBe("very_close");
    expect(result.rows[2]?.position.category).toBe("close");
    expect(result.rows[3]?.position.category).toBe("medium_distance");
    expect(result.rows[4]?.position.category).toBe("further_away");
  });
});
