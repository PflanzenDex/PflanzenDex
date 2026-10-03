import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../light/test-helpers";
import { TreatmentStub, MeasurementsStub } from "./cards-test-helpers";
import {
  NO_TREATMENTS,
  NO_MEASUREMENTS,
  specimenCards,
  dueDate,
  type CardsDependencies,
} from "./index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "./test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const INVISIBLE = "99999999-9999-4999-8999-999999999999";
const TODAY = "2026-10-03";
const light = new InMemoryLight();
let specimens: InMemorySpecimens;
let zone: string;
let shelf: string;
let box: string;
let foreignShelf: string;

const species = new SpeciesStub([{ species: testSpecies(SPECIES) }]);
const dependencies = (extra: Partial<CardsDependencies> = {}): CardsDependencies => ({
  specimens,
  species,
  locations: light.locationAdapter(),
  zones: light.zoneAdapter(),
  measurements: NO_MEASUREMENTS,
  treatments: NO_TREATMENTS,
  ...extra,
});
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

beforeEach(async () => {
  light.zones.length = 0;
  light.locations.length = 0;
  const z = await light.zoneAdapter().create("anna", {
    name: "Zone 3",
    luxCeiling: 30000,
    ppfd: null,
    sortOrder: null,
  });
  zone = typeof z === "string" ? "" : z.id;
  const s = await light
    .locationAdapter()
    .create("anna", { name: "Regal Süd", lightZoneId: zone, kind: "indoor" });
  shelf = typeof s === "string" ? "" : s.id;
  const k = await light
    .locationAdapter()
    .create("anna", { name: "Kiste", lightZoneId: null, kind: "indoor" });
  box = typeof k === "string" ? "" : k.id;
  const f = await light
    .locationAdapter()
    .create("ben", { name: "Fensterbank", lightZoneId: null, kind: "indoor" });
  foreignShelf = typeof f === "string" ? "" : f.id;
  specimens = new InMemorySpecimens({ anna: [shelf, box], ben: [foreignShelf] });
});

describe("US-BES-06 due date of the open treatment", () => {
  it.each([
    ["2026-10-02", "überfällig seit 1 Tg.", "overdue", 1],
    ["2026-09-23", "überfällig seit 10 Tg.", "overdue", 10],
    ["2026-10-03", "heute fällig", "today", 0],
    ["2026-10-04", "in 1 Tg.", "soon", 1],
    ["2026-10-20", "in 17 Tg.", "soon", 17],
  ] as const)('%s yields "%s"', (due, text, kind, days) => {
    expect(dueDate(due, TODAY)).toEqual({ kind, days, text });
  });

  it("counts calendar days across month, year and leap-year boundaries", () => {
    expect(dueDate("2027-01-02", "2026-12-30").days).toBe(3);
    expect(dueDate("2028-03-01", "2028-02-28").days).toBe(2);
    expect(dueDate("2026-02-28", "2026-03-01")).toMatchObject({ kind: "overdue", days: 1 });
  });
});

describe("US-BES-06 Karte: Name, Art, Lichtzone, Status, Standort", () => {
  it("shows name, species, status, location and the light zone of the location", async () => {
    await create("anna", "Bogenhanf", { locationId: shelf });
    const [card] = await specimenCards(dependencies(), "anna", TODAY);
    expect(card).toMatchObject({
      name: "Bogenhanf",
      speciesName: "Bogenhanf",
      status: "plant",
      location: "Regal Süd",
      lightZone: "Zone 3",
      caughtAt: "2026-09-01",
    });
  });

  it('a location without light zone and a missing location stay "unknown" (null), nothing is invented', async () => {
    await create("anna", "A", { locationId: box });
    await create("anna", "B");
    const cards = await specimenCards(dependencies(), "anna", TODAY);
    const target = (n: string) => cards.find((k) => k.name === n);
    expect(target("A")).toMatchObject({ location: "Kiste", lightZone: null });
    expect(target("B")).toMatchObject({ location: null, lightZone: null });
  });

  it('a species the account may not (no longer) see is called "unknown" (null)', async () => {
    await create("anna", "Geist", { speciesId: INVISIBLE });
    const [card] = await specimenCards(dependencies(), "anna", TODAY);
    expect(card?.speciesName).toBeNull();
  });

  it("the German species name applies, otherwise the Latin one", async () => {
    const lat = "22222222-2222-4222-8222-222222222222";
    await create("anna", "Aloe", { speciesId: lat });
    const deps = dependencies({
      species: new SpeciesStub([
        { species: testSpecies(lat, { germanName: null, latinName: "Aloe vera" }) },
      ]),
    });
    expect((await specimenCards(deps, "anna", TODAY))[0]?.speciesName).toBe("Aloe vera");
  });
});

describe("US-BES-06 card: last measurement and photo", () => {
  it("without measurement: no measurement, no photo (placeholder), nothing invented", async () => {
    await create("anna", "Bogenhanf");
    const [card] = await specimenCards(dependencies(), "anna", TODAY);
    expect(card).toMatchObject({ lastMeasurement: null, photo: null });
  });

  it("shows the last measurement with quality, date and note and the photo of the most recent measurement with a photo", async () => {
    const e = await create("anna", "Bogenhanf");
    const measurements = new MeasurementsStub({
      [e.id]: {
        last: { date: "2026-10-01", quality: "healthy", note: "Neues Blatt." },
        photo: { url: "/medien/alt.jpg", date: "2026-09-20" },
      },
    });
    const [card] = await specimenCards(dependencies({ measurements }), "anna", TODAY);
    expect(card?.lastMeasurement).toEqual({
      date: "2026-10-01",
      quality: "healthy",
      note: "Neues Blatt.",
    });
    expect(card?.photo).toEqual({ url: "/medien/alt.jpg", date: "2026-09-20" });
  });

  it("etiolated/thin stays etiolated and is never reinterpreted as a success (etiolation is not a success)", async () => {
    const e = await create("anna", "Bogenhanf");
    const measurements = new MeasurementsStub({
      [e.id]: {
        last: { date: "2026-10-02", quality: "etiolated", note: null },
        photo: null,
      },
    });
    const [card] = await specimenCards(dependencies({ measurements }), "anna", TODAY);
    expect(card?.lastMeasurement?.quality).toBe("etiolated");
  });

  it("asks the ports once for all own specimens, never for foreign ones (tenant, no N+1)", async () => {
    const a1 = await create("anna", "A1");
    const a2 = await create("anna", "A2");
    const b = await create("ben", "B1");
    const measurements = new MeasurementsStub({});
    const treatments = new TreatmentStub({});
    await specimenCards(dependencies({ measurements, treatments }), "anna", TODAY);
    for (const stub of [measurements, treatments]) {
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]?.userId).toBe("anna");
      expect([...(stub.calls[0]?.ids ?? [])].sort()).toEqual([a1.id, a2.id].sort());
      expect(stub.calls[0]?.ids).not.toContain(b.id);
    }
  });
});

describe("US-BES-06 Karte: offene Behandlung", () => {
  const treatment = (id: string, reason: string, dueAt: string) => ({ id, reason, dueAt });

  it("without open treatment: no treatment, 0 more", async () => {
    await create("anna", "Bogenhanf");
    const [card] = await specimenCards(dependencies(), "anna", TODAY);
    expect(card).toMatchObject({ treatment: null, moreTreatments: 0 });
  });

  it("shows reason and due date of the one open treatment", async () => {
    const e = await create("anna", "Bogenhanf");
    const treatments = new TreatmentStub({
      [e.id]: [treatment("b1", "Wurzelfäule behandeln", "2026-09-30")],
    });
    const [card] = await specimenCards(dependencies({ treatments }), "anna", TODAY);
    expect(card?.treatment).toEqual({
      reason: "Wurzelfäule behandeln",
      dueDate: { kind: "overdue", days: 3, text: "überfällig seit 3 Tg." },
    });
    expect(card?.moreTreatments).toBe(0);
  });

  it('with several it shows the one due earliest and counts the others as "+N more"', async () => {
    const e = await create("anna", "Bogenhanf");
    const treatments = new TreatmentStub({
      [e.id]: [
        treatment("b1", "Umtopfen", "2026-10-10"),
        treatment("b2", "Neem spritzen", "2026-10-03"),
        treatment("b3", "Düngen", "2026-10-05"),
      ],
    });
    const [card] = await specimenCards(dependencies({ treatments }), "anna", TODAY);
    expect(card?.treatment).toMatchObject({
      reason: "Neem spritzen",
      dueDate: { text: "heute fällig" },
    });
    expect(card?.moreTreatments).toBe(2);
  });
});

describe("US-BES-06 tenant: only own specimens", () => {
  it("an account sees only cards of its specimens and no data of foreign locations", async () => {
    await create("anna", "Annas Pflanze", { locationId: shelf });
    await create("ben", "Bens Pflanze", { locationId: foreignShelf });
    const annas = await specimenCards(dependencies(), "anna", TODAY);
    const bens = await specimenCards(dependencies(), "ben", TODAY);
    expect(annas.map((k) => k.name)).toEqual(["Annas Pflanze"]);
    expect(bens.map((k) => k.name)).toEqual(["Bens Pflanze"]);
    expect(bens[0]?.location).toBe("Fensterbank");
    expect(JSON.stringify(bens)).not.toContain("Regal Süd");
    expect(await specimenCards(dependencies(), "carla", TODAY)).toEqual([]);
  });
});
