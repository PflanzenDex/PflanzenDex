import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../../light/test-helpers";
import { MeasurementsStub, TreatmentStub } from "./cards-test-helpers";
import {
  CARD_PAGE_MAX,
  CARD_PAGE_SIZE,
  NO_PROVENANCE,
  decodeCardCursor,
  encodeCardCursor,
  parseCardPageQuery,
  specimenCardOf,
  specimenCardPage,
  specimenSummary,
  specimenTreatable,
  type CardCursor,
  type CardPageDependencies,
  type CardPageQuery,
  type MeasuredSource,
  type SpecimenCountRows,
  type SpecimenPageSource,
} from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../shared/test-helpers";
import { isActive, type SpecimenRow } from "../shared/types";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const OTHER_SPECIES = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-10-03";

let light: InMemoryLight;
let specimens: InMemorySpecimens;
let shelf = "";
let box = "";
const species = new SpeciesStub([
  { species: testSpecies(SPECIES) },
  { species: testSpecies(OTHER_SPECIES) },
]);

/**
 * The page reads of the database, as the store answers them (test double): the list order `lower(name)` with `id` as
 * tiebreak, the filter of the card list and a cursor that continues after its row (NFR-12, FR-BES-23).
 */
function memoryPages(store: InMemorySpecimens, counts?: SpecimenCountRows): SpecimenPageSource {
  const key = (z: SpecimenRow) => `${z.name.toLowerCase()}\u0000${z.id}`;
  const filtered = (userId: string, q: CardPageQuery) =>
    store.rows
      .filter((z) => z.userId === userId && isActive(z))
      .filter(
        (z) =>
          q.location === null ||
          (q.location === "none" ? z.locationId === null : z.locationId === q.location),
      )
      .filter((z) => q.species === null || z.speciesId === q.species)
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return {
    async page(userId, q) {
      const all = filtered(userId, q);
      const after = q.after ? `${q.after.name.toLowerCase()}\u0000${q.after.id}` : null;
      const following = all.filter((z) => after === null || key(z) > after);
      const rows = following.slice(0, q.limit + 1).map(({ userId: owner, ...row }) => {
        void owner;
        return row;
      });
      return { rows: rows.slice(0, q.limit), more: rows.length > q.limit, total: all.length };
    },
    async summary() {
      return counts ?? { total: 0, unplaced: 0, groups: [], lastLocationId: null };
    },
    async anyActive(userId, ids) {
      return store.rows.some((z) => z.userId === userId && isActive(z) && ids.includes(z.id));
    },
    async treatable(userId) {
      return filtered(userId, { limit: 0, after: null, location: null, species: null }).map(
        (z) => ({
          id: z.id,
          name: z.name,
          locationId: z.locationId,
        }),
      );
    },
  };
}

const create = async (userId: string, name: string, extra: Record<string, unknown> = {}) => {
  const r = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
    ...extra,
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

const cardDeps = (extra: Partial<CardPageDependencies> = {}): CardPageDependencies => ({
  specimens,
  species,
  locations: light.locationAdapter(),
  zones: light.zoneAdapter(),
  measurements: new MeasurementsStub({}),
  treatments: new TreatmentStub({}),
  provenance: NO_PROVENANCE,
  pages: memoryPages(specimens),
  ...extra,
});

const query = (q: Partial<CardPageQuery> = {}): CardPageQuery => ({
  limit: 2,
  after: null,
  location: null,
  species: null,
  ...q,
});

beforeEach(async () => {
  light = new InMemoryLight();
  const s = await light
    .locationAdapter()
    .create("anna", { name: "Regal Süd", lightZoneId: null, kind: "indoor" });
  shelf = typeof s === "string" ? "" : s.id;
  const k = await light
    .locationAdapter()
    .create("anna", { name: "Kiste", lightZoneId: null, kind: "indoor" });
  box = typeof k === "string" ? "" : k.id;
  specimens = new InMemorySpecimens({ anna: [shelf, box] });
});

describe("US-BES-06 · FR-BES-23 cursor of the card list", () => {
  it("FR-BES-23 a cursor decodes to the cursor it was made from (opaque text, no ID leaks in the list)", () => {
    const cursor: CardCursor = { name: "Ölbaum", id: SPECIES };
    const text = encodeCardCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9%._~-]+$/);
    expect(decodeCardCursor(text)).toEqual(cursor);
  });

  it.each([
    ["the empty text", ""],
    ["text that is no JSON", "!!! nicht JSON !!!"],
    ["a broken escape", "%E0%A4%A"],
    ["JSON that is no object", encodeURIComponent("[1, 2")],
    ["JSON without a name", encodeURIComponent(`{"id":"${SPECIES}"}`)],
    ["a name that is no text", encodeURIComponent(`{"name":7,"id":"${SPECIES}"}`)],
    ["an ID that is no UUID", encodeURIComponent('{"name":"a","id":"x"}')],
    [
      "a name with a NUL character (PostgreSQL refuses it)",
      encodeCardCursor({ name: "a\u0000b", id: SPECIES }),
    ],
    ["a NUL escape in the name", encodeURIComponent(`{"name":"a\\u0000b","id":"${SPECIES}"}`)],
  ])("FR-BES-23 a malformed cursor (%s) decodes to null", (_, text) => {
    expect(decodeCardCursor(text)).toBeNull();
  });
});

describe("US-BES-06 · FR-BES-23 input of the card list", () => {
  it("FR-BES-23 the default page has 100 cards (starting value, assumption) and the range is 1 to 200", () => {
    expect(CARD_PAGE_SIZE).toBe(100);
    expect(CARD_PAGE_MAX).toBe(200);
    expect(parseCardPageQuery({})).toEqual({
      ok: true,
      query: { limit: 100, after: null, location: null, species: null },
    });
    expect(parseCardPageQuery({ limit: "1" })).toMatchObject({ ok: true, query: { limit: 1 } });
    expect(parseCardPageQuery({ limit: "200" })).toMatchObject({ ok: true, query: { limit: 200 } });
  });

  it.each(["0", "201", "1.5", "-3", "abc", "", " 5", "99999999999"])(
    "FR-BES-23 an invalid limit (%j) names the field limit",
    (limit) => {
      expect(parseCardPageQuery({ limit })).toEqual({ ok: false, field: "limit" });
    },
  );

  it("FR-BES-23 a malformed cursor names the field after; a cursor from the list is accepted", () => {
    expect(parseCardPageQuery({ after: "nope!" })).toEqual({ ok: false, field: "after" });
    const after = encodeCardCursor({ name: "Aloe", id: SPECIES });
    expect(parseCardPageQuery({ after })).toMatchObject({
      ok: true,
      query: { after: { name: "Aloe" } },
    });
  });

  it("FR-BES-23 location: a location ID or `none`, species: an ID; anything else names its field", () => {
    expect(parseCardPageQuery({ location: "none" })).toMatchObject({
      ok: true,
      query: { location: "none" },
    });
    expect(parseCardPageQuery({ location: SPECIES.toUpperCase() })).toMatchObject({
      ok: true,
      query: { location: SPECIES },
    });
    expect(parseCardPageQuery({ location: "Regal" })).toEqual({ ok: false, field: "location" });
    expect(parseCardPageQuery({ species: "Aloe vera" })).toEqual({ ok: false, field: "species" });
    expect(parseCardPageQuery({ species: OTHER_SPECIES })).toMatchObject({
      ok: true,
      query: { species: OTHER_SPECIES },
    });
  });
});

describe("US-BES-06 · FR-BES-23 pages of the card list", () => {
  it("FR-BES-23 pages in name order: every card once, the total of the whole list on each page, a cursor only while a card follows", async () => {
    for (const name of ["Dill", "aloe", "Basilikum", "Chili", "Efeu"]) await create("anna", name);
    const deps = cardDeps();
    const seen: string[] = [];
    const totals: number[] = [];
    let after: CardCursor | null = null;
    let next: string | null = "start";
    let pages = 0;
    while (next !== null) {
      const page = await specimenCardPage(deps, "anna", TODAY, query({ after, limit: 2 }));
      totals.push(page.total);
      seen.push(...page.cards.map((c) => c.name));
      next = page.next;
      after = next === null ? null : decodeCardCursor(next);
      pages++;
    }
    expect(seen).toEqual(["aloe", "Basilikum", "Chili", "Dill", "Efeu"]);
    expect(totals).toEqual([5, 5, 5]);
    expect(pages).toBe(3);
  });

  it("FR-BES-23 next is null on the last page, also when the page is full", async () => {
    await create("anna", "Eins");
    await create("anna", "Zwei");
    const full = await specimenCardPage(cardDeps(), "anna", TODAY, query({ limit: 2 }));
    expect(full.cards).toHaveLength(2);
    expect(full.next).toBeNull();
  });

  it("FR-BES-23 an empty account has an empty page with total 0 and no cursor", async () => {
    expect(await specimenCardPage(cardDeps(), "anna", TODAY, query())).toEqual({
      cards: [],
      total: 0,
      next: null,
    });
  });

  it("NFR-12 the measurement, treatment and provenance ports are asked for the cards of the page only", async () => {
    for (const name of ["Eins", "Zwei", "Drei"]) await create("anna", name);
    const measurements = new MeasurementsStub({});
    const treatments = new TreatmentStub({});
    const page = await specimenCardPage(
      cardDeps({ measurements, treatments }),
      "anna",
      TODAY,
      query({ limit: 2 }),
    );
    const ids = page.cards.map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(measurements.calls).toEqual([{ userId: "anna", ids }]);
    expect(treatments.calls).toEqual([{ userId: "anna", ids }]);
  });

  it("FR-BES-23 location filter: a location shows its cards only, `none` the cards without a location", async () => {
    await create("anna", "Am Regal", { locationId: shelf });
    await create("anna", "In der Kiste", { locationId: box });
    await create("anna", "Ohne Ort");
    const deps = cardDeps();
    const atShelf = await specimenCardPage(deps, "anna", TODAY, query({ location: shelf }));
    expect(atShelf.cards.map((c) => c.name)).toEqual(["Am Regal"]);
    expect(atShelf.total).toBe(1);
    const unplaced = await specimenCardPage(deps, "anna", TODAY, query({ location: "none" }));
    expect(unplaced.cards.map((c) => c.name)).toEqual(["Ohne Ort"]);
    expect(unplaced.total).toBe(1);
  });

  it("FR-BES-23 species filter: only the cards of that species; the total follows the filter", async () => {
    await create("anna", "Aloe");
    await create("anna", "Basilikum", { speciesId: OTHER_SPECIES });
    const page = await specimenCardPage(
      cardDeps(),
      "anna",
      TODAY,
      query({ species: OTHER_SPECIES }),
    );
    expect(page.cards.map((c) => c.name)).toEqual(["Basilikum"]);
    expect(page.total).toBe(1);
  });

  it("US-BES-06 another account's cards never appear, not in the page and not in the total (P-04)", async () => {
    specimens = new InMemorySpecimens({ anna: [shelf], ben: [] });
    await create("anna", "Meine");
    await create("ben", "Fremde");
    const page = await specimenCardPage(cardDeps(), "anna", TODAY, query({ limit: 10 }));
    expect(page.cards.map((c) => c.name)).toEqual(["Meine"]);
    expect(page.total).toBe(1);
  });
});

describe("US-BES-06 · FR-BES-23 one card and the summary", () => {
  it("US-BES-06 one card by ID is the card of the list; archived, unknown and foreign IDs give null (P-04)", async () => {
    const mine = await create("anna", "Meine", { locationId: shelf });
    const archived = await create("anna", "Archiviert");
    const foreign = await specimens.create("ben", {
      speciesId: SPECIES,
      name: "Fremde",
      marker: null,
      locationId: null,
      caughtAt: null,
    });
    if (typeof foreign === "string") throw new Error(foreign);
    const row = specimens.rows.find((z) => z.id === archived.id);
    if (row) Object.assign(row, { status: "archived" });
    const deps = cardDeps();
    const card = await specimenCardOf(deps, "anna", TODAY, mine.id);
    expect(card).toMatchObject({ id: mine.id, name: "Meine", location: "Regal Süd" });
    expect(await specimenCardOf(deps, "anna", TODAY, archived.id)).toBeNull();
    expect(await specimenCardOf(deps, "anna", TODAY, foreign.id)).toBeNull();
    expect(await specimenCardOf(deps, "anna", TODAY, "not-an-id")).toBeNull();
  });

  it("US-BES-06 the summary takes its counts from the database, the place names from the places, and whether an active plant is measured from its port", async () => {
    const plant = await create("anna", "Gemessen", { locationId: shelf });
    const counts: SpecimenCountRows = {
      total: 1000,
      unplaced: 3,
      groups: [{ locationId: shelf, count: 999 }],
      lastLocationId: shelf,
    };
    const asked: string[] = [];
    const measured: MeasuredSource = {
      measuredSpecimenIds: async (userId) => {
        asked.push(userId);
        return [plant.id];
      },
    };
    const summary = await specimenSummary(
      cardDeps({ pages: memoryPages(specimens, counts), measured }),
      "anna",
    );
    expect(summary).toEqual({
      total: 1000,
      unplaced: 3,
      groups: [{ locationId: shelf, location: "Regal Süd", count: 999 }],
      lastLocation: "Regal Süd",
      anyMeasured: true,
    });
    expect(asked).toEqual(["anna"]);
  });

  it("US-BES-06 a measured plant that is archived, or another account's, does not make a plant measured (P-04)", async () => {
    const gone = await create("anna", "Archiviert");
    const foreign = await create("ben", "Fremd");
    const row = specimens.rows.find((z) => z.id === gone.id);
    if (row) Object.assign(row, { status: "archived" });
    const measured: MeasuredSource = { measuredSpecimenIds: async () => [gone.id, foreign.id] };
    const summary = await specimenSummary(cardDeps({ measured }), "anna");
    expect(summary.anyMeasured).toBe(false);
  });

  it("US-BES-06 without a measurement port the summary says no plant is measured (nothing invented, P-08)", async () => {
    const summary = await specimenSummary(cardDeps(), "anna");
    expect(summary).toEqual({
      total: 0,
      unplaced: 0,
      groups: [],
      lastLocation: null,
      anyMeasured: false,
    });
  });

  it("US-BES-06 the summary groups are sorted by place name; a place that is unknown keeps its count with a null name (P-08)", async () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    const counts: SpecimenCountRows = {
      total: 4,
      unplaced: 0,
      groups: [
        { locationId: shelf, count: 2 },
        { locationId: box, count: 1 },
        { locationId: unknown, count: 1 },
      ],
      lastLocationId: unknown,
    };
    const summary = await specimenSummary(
      cardDeps({ pages: memoryPages(specimens, counts) }),
      "anna",
    );
    expect(summary.groups).toEqual([
      { locationId: unknown, location: null, count: 1 },
      { locationId: box, location: "Kiste", count: 1 },
      { locationId: shelf, location: "Regal Süd", count: 2 },
    ]);
    expect(summary.lastLocation).toBeNull();
  });

  it("US-BES-06 treatment list: every active plant with its place name, null without a place, cuttings included, archived ones left out", async () => {
    await create("anna", "Mit Ort", { locationId: box });
    await create("anna", "Ohne Ort");
    const gone = await create("anna", "Weg");
    const row = specimens.rows.find((z) => z.id === gone.id);
    if (row) Object.assign(row, { status: "archived" });
    expect(await specimenTreatable(cardDeps(), "anna")).toEqual([
      { id: expect.any(String), name: "Mit Ort", location: "Kiste" },
      { id: expect.any(String), name: "Ohne Ort", location: null },
    ]);
  });
});
