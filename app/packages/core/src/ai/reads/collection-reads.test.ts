import { describe, expect, it } from "vitest";
import { InMemoryAiLog } from "../test-helpers";
import { aiGetSpecies, aiSearchSpecies } from "./catalog-reads";
import {
  aiGetSpecimen,
  aiListLightZones,
  aiListLocations,
  aiListMeasurements,
  aiListSpecimens,
} from "./collection-reads";
import type { CollectionReadSource, SpeciesItem, SpecimenItem } from "./types";

const now = new Date("2026-11-02T08:00:00Z");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const aloe: SpeciesItem = {
  id: uuid(1),
  latinName: "Aloe vera",
  germanName: "Echte Aloe",
  synonyms: ["Aloe barbadensis"],
  reviewStatus: "approved",
  own: false,
  specimens: 2,
};
const ficus: SpeciesItem = {
  ...aloe,
  id: uuid(2),
  latinName: "Ficus carica",
  germanName: "Feige",
  synonyms: [],
  specimens: 0,
};
const specimen = (n: number, name: string, extra: Partial<SpecimenItem> = {}): SpecimenItem => ({
  id: uuid(100 + n),
  name,
  speciesId: aloe.id,
  speciesName: "Echte Aloe",
  marker: null,
  status: "plant",
  location: "Regal 2",
  lightZone: "Hell",
  lightZoneSource: "location",
  caughtAt: "2026-01-01",
  archivedAt: null,
  ...extra,
});

/** Account A owns everything; account B owns its own location only (P-04: the fake answers per account). */
function source(): CollectionReadSource {
  const mine = (u: string) => u === "anna";
  const rows = [
    specimen(1, "Echte Aloe – blau", { marker: "blau" }),
    specimen(2, "Echte Aloe – rot", {
      marker: "rot",
      location: null,
      lightZone: null,
      lightZoneSource: null,
    }),
    specimen(3, "Echte Aloe – alt", {
      status: "archived",
      location: null,
      lightZone: null,
      archivedAt: "2026-10-01",
    }),
  ];
  return {
    searchSpecies: async (_u, text) =>
      [ficus, aloe].filter((s) =>
        [s.latinName, s.germanName ?? "", ...s.synonyms].some((n) =>
          n.toLowerCase().includes(text.toLowerCase()),
        ),
      ),
    species: async (_u, id) => [aloe, ficus].find((s) => s.id === id) ?? null,
    specimens: async (u) => (mine(u) ? rows : []),
    specimen: async (u, id) => (mine(u) ? (rows.find((r) => r.id === id) ?? null) : null),
    locations: async (u) =>
      mine(u)
        ? [{ id: uuid(10), name: "Regal 2", kind: "indoor", lightZoneId: uuid(21) }]
        : [{ id: uuid(11), name: "Bernds Fenster", kind: "indoor", lightZoneId: null }],
    zones: async (u) =>
      mine(u)
        ? [
            { id: uuid(21), name: "Hell", luxCeiling: 20000, ppfd: null, sortOrder: 3 },
            { id: uuid(20), name: "Stecklingslicht", luxCeiling: 5000, ppfd: 100, sortOrder: 1 },
          ]
        : [],
    measurements: async (u, id) =>
      mine(u) && id === uuid(101)
        ? { specimenId: id, growth: "unknown", measurements: [{ id: "m2" }, { id: "m1" }] }
        : null,
  };
}
const setup = () => ({ source: source(), log: new InMemoryAiLog() });
const call = (input: unknown, userId = "anna", rights: "read" | "drafts" = "read") => ({
  userId,
  connectionId: "c1",
  rights,
  input,
  now,
});
const TZ = { timeZone: "Europe/Berlin" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const value = (r: { ok: boolean }) => (r as any).value;
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("US-KI-11 read the catalog by name", () => {
  it("US-KI-11 search by Latin name, German name or synonym (at least 2 characters), with id, status and own specimens", async () => {
    const s = setup();
    for (const q of ["aloe v", "echte", "barbadensis"]) {
      const r = await aiSearchSpecies(s, call({ query: q }));
      expect(value(r).items).toEqual([aloe]);
    }
    expect(code(await aiSearchSpecies(s, call({ query: "a" })))).toBe("input.invalid");
  });

  it("US-KI-11 lists are paged with a stable order, the total and the next page (FR-KI-16)", async () => {
    const s = setup();
    const first = value(await aiSearchSpecies(s, call({ query: "ar", limit: 1 })));
    expect(first).toMatchObject({ total: 2, offset: 0, limit: 1, nextOffset: 1 });
    expect(first.items[0].latinName).toBe("Aloe vera");
    const last = value(await aiSearchSpecies(s, call({ query: "ar", offset: 1, limit: 1 })));
    expect(last).toMatchObject({ nextOffset: null, items: [{ latinName: "Ficus carica" }] });
    expect(code(await aiSearchSpecies(s, call({ query: "ar", limit: 101 })))).toBe("input.invalid");
  });

  it("US-KI-11 a species by name or synonym; an unknown name is not_found with the nearest names", async () => {
    const s = setup();
    expect(value(await aiGetSpecies(s, call({ species: "Aloe barbadensis" }))).species).toEqual(
      aloe,
    );
    expect(value(await aiGetSpecies(s, call({ species: aloe.id }))).species).toEqual(aloe);
    const r = await aiGetSpecies(s, call({ species: "Ficus caricca" }));
    expect(code(r)).toBe("species.not_found");
    expect(r.ok ? null : r.error.data).toMatchObject({ nearest: ["Ficus carica (Feige)"] });
  });

  it("US-KI-11 reads need the right 'read' and every call is logged with a count, never content (FR-KI-19)", async () => {
    const s = setup();
    await aiSearchSpecies(s, call({ query: "aloe" }));
    await aiGetSpecies(s, call({ species: "Nichtda" }));
    expect(s.log.rows.map((r) => [r.operation, r.effect])).toEqual([
      ["search_species", "read: 1 of 1 species"],
      ["get_species", "refused: species.not_found"],
    ]);
  });
});

describe("US-KI-11 read the collection by name", () => {
  it("US-KI-11 my specimens are active by default, archived on request, each with ids and readable names", async () => {
    const s = setup();
    const active = value(await aiListSpecimens(s, call(TZ))).items;
    expect(active.map((x: { name: string }) => x.name)).toEqual([
      "Echte Aloe – blau",
      "Echte Aloe – rot",
    ]);
    expect(active[0]).toMatchObject({
      species: { id: aloe.id, name: "Echte Aloe" },
      location: { id: uuid(10), name: "Regal 2" },
      lightZone: { id: uuid(21), name: "Hell", number: 2, source: "location" },
    });
    expect(active[1]).toMatchObject({ location: null, lightZone: null });
    const archived = value(await aiListSpecimens(s, call({ ...TZ, status: "archived" }))).items;
    expect(archived.map((x: { name: string }) => x.name)).toEqual(["Echte Aloe – alt"]);
  });

  it("US-KI-11 filters take names: location 'Regal 2', zone '2', species 'Aloe vera'", async () => {
    const s = setup();
    for (const filter of [{ location: "Regal 2" }, { lightZone: "2" }, { lightZone: "hell" }]) {
      const items = value(await aiListSpecimens(s, call({ ...TZ, ...filter }))).items;
      expect(items.map((x: { name: string }) => x.name)).toEqual(["Echte Aloe – blau"]);
    }
    expect(value(await aiListSpecimens(s, call({ ...TZ, species: "Aloe vera" }))).total).toBe(2);
    expect(code(await aiListSpecimens(s, call({ ...TZ, location: "Keller" })))).toBe(
      "location.not_found",
    );
  });

  it("US-KI-11 a specimen by name; several hits return the candidates and nothing is done (KI-R4)", async () => {
    const s = setup();
    const one = value(await aiGetSpecimen(s, call({ ...TZ, specimen: "Echte Aloe (blau)" })));
    expect(one.specimen).toMatchObject({ id: uuid(101), details: { marker: "blau" } });
    const r = await aiGetSpecimen(s, call({ ...TZ, specimen: "Echte Aloe" }));
    expect(code(r)).toBe("ai.reference_ambiguous");
    expect(r.ok ? null : r.error.data).toMatchObject({
      candidates: [{ id: uuid(101) }, { id: uuid(102) }],
    });
  });

  it("US-KI-11 locations and light zones with id, name and zone number (1 = cutting light)", async () => {
    const s = setup();
    expect(
      value(await aiListLightZones(s, call({}))).items.map(
        (z: { number: number; name: string }) => [z.number, z.name],
      ),
    ).toEqual([
      [1, "Stecklingslicht"],
      [2, "Hell"],
    ]);
    expect(value(await aiListLocations(s, call({}))).items).toEqual([
      {
        id: uuid(10),
        name: "Regal 2",
        kind: "indoor",
        lightZone: { id: uuid(21), name: "Hell", number: 2 },
      },
    ]);
  });

  it("US-KI-11 the measurements of a specimen named by name, paged, as the app computes them", async () => {
    const s = setup();
    const r = value(await aiListMeasurements(s, call({ specimen: "echte aloe blau", limit: 1 })));
    expect(r).toMatchObject({
      specimen: { id: uuid(101) },
      growth: "unknown",
      total: 2,
      nextOffset: 1,
      items: [{ id: "m2" }],
    });
  });
});

describe("US-KI-11 tenant isolation (P-04, FR-KI-23)", () => {
  it("US-KI-11 a connection of B sees none of A's specimens, locations or zones; A's ids and names are not_found", async () => {
    const s = setup();
    expect(value(await aiListSpecimens(s, call(TZ, "bernd"))).total).toBe(0);
    expect(
      value(await aiListLocations(s, call({}, "bernd"))).items.map((l: { name: string }) => l.name),
    ).toEqual(["Bernds Fenster"]);
    expect(
      value(await aiListLocations(s, call({}, "anna"))).items.map((l: { name: string }) => l.name),
    ).not.toContain("Bernds Fenster");
    expect(code(await aiGetSpecimen(s, call({ ...TZ, specimen: uuid(101) }, "bernd")))).toBe(
      "specimen.not_found",
    );
    expect(
      code(await aiGetSpecimen(s, call({ ...TZ, specimen: "Echte Aloe – blau" }, "bernd"))),
    ).toBe("specimen.not_found");
    expect(code(await aiListMeasurements(s, call({ specimen: uuid(101) }, "bernd")))).toBe(
      "specimen.not_found",
    );
    expect(code(await aiListSpecimens(s, call({ ...TZ, location: "Regal 2" }, "bernd")))).toBe(
      "location.not_found",
    );
  });
});
