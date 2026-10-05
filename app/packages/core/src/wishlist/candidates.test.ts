import { beforeEach, describe, expect, it } from "vitest";
import { wishCandidates } from "./index";
import { InMemoryWishes, ZoneStockStub } from "./test-helpers";

const Z2 = "z2";
const Z3 = "z3";
const Z4 = "z4";
const stockAnna = (c2: number, c3: number, c4: number) => [
  { zoneId: Z2, name: "Lampe 2", count: c2 },
  { zoneId: Z3, name: "Lampe 3", count: c3 },
  { zoneId: Z4, name: "Lampe 4", count: c4 },
];

let wishes: InMemoryWishes;
let stock: ZoneStockStub;
const candidates = (userId = "anna") => wishCandidates({ wishes, stock }, userId);
const names = async (userId = "anna") => (await candidates(userId)).candidates.map((c) => c.name);

beforeEach(() => {
  wishes = new InMemoryWishes();
  stock = new ZoneStockStub({ anna: stockAnna(5, 1, 3), ben: stockAnna(0, 0, 0) });
});

describe("US-WUN-01 candidates sorted by the stock of the target zone", () => {
  it("US-WUN-01 sorts ascending by the specimen count of the target zone", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z2 });
    wishes.seed("anna", { id: "b", name: "Bryophyllum", targetZoneId: Z3 });
    wishes.seed("anna", { id: "c", name: "Cereus", targetZoneId: Z4 });
    expect(await names()).toEqual(["Bryophyllum", "Cereus", "Aloe"]);
  });

  it("US-WUN-01 an unknown target zone comes last, even behind the fullest zone", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: null });
    wishes.seed("anna", { id: "b", name: "Bryophyllum", targetZoneId: Z2 });
    expect(await names()).toEqual(["Bryophyllum", "Aloe"]);
  });

  it("US-WUN-01 a zone that is not among zones 2 to 4 does not count and says so, not 'unknown' (FR-WUN-03)", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: "zone-1-cutting-light" });
    wishes.seed("anna", { id: "b", name: "Bryophyllum", targetZoneId: Z4 });
    wishes.seed("anna", { id: "c", name: "Cereus" });
    const list = await candidates();
    expect(list.candidates.map((c) => [c.name, c.zone, c.stock])).toEqual([
      ["Bryophyllum", { id: Z4, name: "Lampe 4" }, 3],
      ["Aloe", null, null],
      ["Cereus", null, null],
    ]);
    const [, outside, unknown] = list.candidates;
    expect(outside?.priority.kind).toBe("zone_outside");
    expect(outside?.zoneText).toBe("Ziel-Zone liegt außerhalb der Zonen 2 bis 4");
    expect(outside?.priority.text).toContain("zählt");
    expect(unknown?.priority.kind).toBe("zone_unknown");
    expect(unknown?.zoneText).toBe("Ziel-Zone unbekannt");
  });

  it("US-WUN-01 on equal stock the order of the zones, then the name, decides (stable)", async () => {
    stock = new ZoneStockStub({ anna: stockAnna(2, 2, 2) });
    wishes.seed("anna", { id: "1", name: "Zebra", targetZoneId: Z2 });
    wishes.seed("anna", { id: "2", name: "Äpfel", targetZoneId: Z3 });
    wishes.seed("anna", { id: "3", name: "Aloe", targetZoneId: Z3 });
    expect(await names()).toEqual(["Zebra", "Aloe", "Äpfel"]);
  });

  it("US-WUN-01 only open wishes (status wishlist) are candidates (FR-WUN-02)", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z3 });
    wishes.seed("anna", { id: "b", name: "Bought", targetZoneId: Z3, status: "bought" });
    wishes.seed("anna", { id: "c", name: "Dropped", targetZoneId: Z3, status: "discarded" });
    expect(await names()).toEqual(["Aloe"]);
  });
});

describe("US-WUN-01 what a candidate shows", () => {
  it("US-WUN-01 shows photo with source, 'German (name)', zone with stock, difficulty and reasoning", async () => {
    wishes.seed("anna", {
      id: "a",
      name: "Haworthia fasciata",
      german: "Zebra-Haworthie",
      targetZoneId: Z3,
      difficulty: 2,
      reasoning: "Bleibt klein und mag helles Licht.",
      imageUrl: "https://example.test/h.jpg",
      imageSource: "Wikimedia Commons",
    });
    const [c] = (await candidates()).candidates;
    expect(c).toMatchObject({
      title: "Zebra-Haworthie (Haworthia fasciata)",
      zone: { id: Z3, name: "Lampe 3" },
      stock: 1,
      zoneText: "Lampe 3 — 1 Pflanze",
      difficulty: 2,
      reasoning: "Bleibt klein und mag helles Licht.",
      image: { url: "https://example.test/h.jpg", source: "Wikimedia Commons" },
    });
  });

  it("US-WUN-01 without a German name the title is the plain name, without a photo there is none (P-08)", async () => {
    wishes.seed("anna", { id: "a", name: "Haworthia fasciata", targetZoneId: Z3 });
    const [c] = (await candidates()).candidates;
    expect(c).toMatchObject({
      title: "Haworthia fasciata",
      german: null,
      difficulty: null,
      reasoning: null,
      image: null,
    });
  });

  it("US-WUN-01 the stock text says '0 Pflanzen' for an empty zone and names an unknown zone as unknown", async () => {
    stock = new ZoneStockStub({ anna: stockAnna(0, 4, 4) });
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z2 });
    wishes.seed("anna", { id: "b", name: "Bryophyllum" });
    const list = (await candidates()).candidates;
    expect(list.map((c) => c.zoneText)).toEqual(["Lampe 2 — 0 Pflanzen", "Ziel-Zone unbekannt"]);
  });

  it("US-WUN-01 explains why: the thinnest zone is named, other zones point to where room is left", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z2 });
    wishes.seed("anna", { id: "b", name: "Bryophyllum", targetZoneId: Z3 });
    wishes.seed("anna", { id: "c", name: "Cereus" });
    const [thin, other, unknown] = (await candidates()).candidates;
    expect(thin?.name).toBe("Bryophyllum");
    expect(thin?.priority).toMatchObject({ kind: "thinnest" });
    expect(thin?.priority.text).toContain("am meisten Platz");
    expect(other?.priority.kind).toBe("other");
    expect(other?.priority.text).toContain("Lampe 3");
    expect(unknown?.priority.kind).toBe("zone_unknown");
    expect(unknown?.priority.text).toContain("zählt");
  });

  it("US-WUN-01 equally full zones are no 'thinnest' zone: the reason says so instead of inventing one", async () => {
    stock = new ZoneStockStub({ anna: stockAnna(2, 2, 2) });
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z2 });
    const [c] = (await candidates()).candidates;
    expect(c?.priority.kind).toBe("tie");
    expect(c?.priority.text).toContain("gleich");
  });
});

describe("US-WUN-01 empty list and the next action (P-09)", () => {
  it("US-WUN-01 without open candidates the text is 'Keine offenen Kandidaten in der Wunschliste.'", async () => {
    const list = await candidates();
    expect(list.candidates).toEqual([]);
    expect(list.hint.text).toBe("Keine offenen Kandidaten in der Wunschliste.");
    expect(list.hint.nextAction).not.toBe("");
  });

  it("US-WUN-01 the next action never claims equal stock when the zones differ, and the grammar follows the count", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z3 });
    stock = new ZoneStockStub({ anna: stockAnna(5, 1, 0) });
    const { hint, candidates: list } = await candidates();
    expect(list[0]?.priority.kind).toBe("other");
    expect(list[0]?.priority.text).toContain("Hier steht schon 1 Pflanze");
    expect(hint.nextAction).not.toContain("gleich belegt");
    stock = new ZoneStockStub({ anna: stockAnna(2, 2, 2) });
    expect((await candidates()).hint.nextAction).toContain("gleich belegt");
  });

  it("US-WUN-01 a list with candidates names the first one to get and its zone", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z3 });
    const { hint } = await candidates();
    expect(hint.text).toContain("Aloe");
    expect(hint.text).toContain("Lampe 3");
    expect(hint.nextAction).not.toBe("");
  });

  it("US-WUN-01 if no candidate has a usable zone, the hint asks for a target zone instead of ranking blindly", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe" });
    const { hint } = await candidates();
    expect(hint.text).toContain("Ziel-Lichtzone");
    expect(hint.nextAction).toContain("Zone");
  });

  it("US-WUN-01 the zones with their stock come along for the form, also with count 0", async () => {
    stock = new ZoneStockStub({ anna: stockAnna(0, 1, 2) });
    expect((await candidates()).zones.map((z) => [z.name, z.count])).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 1],
      ["Lampe 4", 2],
    ]);
  });

  it("US-WUN-01 an account without zones 2 to 4 has no usable zone: a wish with a zone is named as outside zones 2 to 4, no crash", async () => {
    stock = new ZoneStockStub({});
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z2 });
    const list = await candidates();
    expect(list.candidates.map((c) => c.priority.kind)).toEqual(["zone_outside"]);
    expect(list.zones).toEqual([]);
  });
});

describe("US-WUN-01 tenant isolation (P-04, P-05)", () => {
  it("US-WUN-01 never shows the wishes of another account and asks the stock for the caller only", async () => {
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z3 });
    wishes.seed("ben", { id: "b", name: "Bens Geheimtipp", targetZoneId: Z3 });
    expect(await names("anna")).toEqual(["Aloe"]);
    expect(await names("ben")).toEqual(["Bens Geheimtipp"]);
    expect(await names("carla")).toEqual([]);
    expect(stock.calls).toEqual(["anna", "ben", "carla"]);
  });

  it("US-WUN-01 the stock of another account does not rank my wishes", async () => {
    // Ben has empty zones, Anna's zone 3 holds 1 specimen: Anna sees 1, not 0.
    wishes.seed("anna", { id: "a", name: "Aloe", targetZoneId: Z3 });
    expect((await candidates("anna")).candidates[0]?.stock).toBe(1);
  });
});
