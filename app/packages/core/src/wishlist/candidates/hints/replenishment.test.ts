import { beforeEach, describe, expect, it } from "vitest";
import { REPLENISH_BUFFER, wishCandidates } from "../../index";
import { InMemoryWishes, ZoneStockStub } from "../../test-helpers";

const stock = (c2: number, c3: number, c4: number) => [
  { zoneId: "z2", name: "Lampe 2", count: c2 },
  { zoneId: "z3", name: "Lampe 3", count: c3 },
  { zoneId: "z4", name: "Lampe 4", count: c4 },
];

let wishes: InMemoryWishes;
const replenishment = async () =>
  (await wishCandidates({ wishes, stock: new ZoneStockStub({ anna: stock(5, 1, 3) }) }, "anna"))
    .replenishment;
const open = (zone: string | null, n: number, prefix = zone ?? "x") => {
  for (let i = 0; i < n; i += 1)
    wishes.seed("anna", { id: `${prefix}${i}`, name: `${prefix}-${i}`, targetZoneId: zone });
};

beforeEach(() => {
  wishes = new InMemoryWishes();
});

describe("US-WUN-02 warning before the list is empty", () => {
  it("US-WUN-02 the buffer is 2 open candidates per zone 2 to 4 (starting value)", () => {
    expect(REPLENISH_BUFFER).toBe(2);
  });

  it("US-WUN-02 warns for every zone below the buffer, naming zone and count", async () => {
    open("z2", 2);
    open("z3", 1);
    const r = await replenishment();
    expect(r.buffer).toBe(2);
    expect(r.zones.map((z) => [z.zoneId, z.open, z.text])).toEqual([
      ["z3", 1, "Nachschub nötig: Lampe 3 (1 offener Kandidat)"],
      ["z4", 0, "Nachschub nötig: Lampe 4 (0 offene Kandidaten)"],
    ]);
  });

  it("US-WUN-02 no warning when every zone has the buffer", async () => {
    open("z2", 2);
    open("z3", 3);
    open("z4", 2);
    const r = await replenishment();
    expect(r.zones).toEqual([]);
    expect(r.nextAction).toBeNull();
  });

  it("US-WUN-02 wishes without a zone 2 to 4 do not count towards any zone (FR-WUN-03)", async () => {
    open(null, 3);
    open("zone-1-cutting-light", 3, "cut");
    const r = await replenishment();
    expect(r.zones.map((z) => z.open)).toEqual([0, 0, 0]);
  });

  it("US-WUN-02 bought and discarded wishes do not count as open (FR-WUN-02)", async () => {
    open("z2", 1);
    wishes.seed("anna", { id: "b", name: "Bought", targetZoneId: "z2", status: "bought" });
    wishes.seed("anna", { id: "d", name: "Dropped", targetZoneId: "z2", status: "discarded" });
    const r = await replenishment();
    expect(r.zones.find((z) => z.zoneId === "z2")?.open).toBe(1);
  });

  it("US-ENT-07 offers Discover for the zone, with its number, while Fetch suggestions does not exist yet (P-09)", async () => {
    const r = await replenishment();
    expect(r.nextAction).toContain("Wunsch erfassen");
    expect(r.actions).toEqual({ discover: true, suggestions: false });
    expect(r.zones.map((z) => z.zoneNumber)).toEqual([2, 3, 4]);
  });
});

describe("US-WUN-02 the buffer is the account's setting", () => {
  const withBuffer = (buffer: number | undefined) =>
    wishCandidates(
      {
        wishes,
        stock: new ZoneStockStub(
          { anna: stock(5, 1, 3) },
          {},
          buffer === undefined ? {} : { anna: buffer },
        ),
      },
      "anna",
    );

  it("without a stored value the default of 2 applies", async () => {
    open("z2", 2);
    open("z3", 2);
    open("z4", 2);
    expect((await withBuffer(undefined)).replenishment).toMatchObject({ buffer: 2, zones: [] });
  });

  it("a higher buffer warns for more zones, at once", async () => {
    open("z2", 2);
    open("z3", 2);
    open("z4", 2);
    const r = (await withBuffer(3)).replenishment;
    expect(r.buffer).toBe(3);
    expect(r.zones.map((z) => z.name)).toEqual(["Lampe 2", "Lampe 3", "Lampe 4"]);
  });

  it("a lower buffer warns for fewer zones; 0 switches the warning off", async () => {
    open("z2", 1);
    expect((await withBuffer(1)).replenishment.zones.map((z) => z.name)).toEqual([
      "Lampe 3",
      "Lampe 4",
    ]);
    const off = (await withBuffer(0)).replenishment;
    expect(off).toMatchObject({ buffer: 0, zones: [], nextAction: null });
  });

  it("the buffer of another account never applies (P-04)", async () => {
    const stub = new ZoneStockStub({ anna: stock(5, 1, 3) }, {}, { ben: 9 });
    const r = await wishCandidates({ wishes, stock: stub }, "anna");
    expect(r.replenishment.buffer).toBe(2);
  });
});
