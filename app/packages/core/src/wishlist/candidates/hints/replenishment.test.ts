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

  it("US-WUN-02 says what to do next while the actions of Discover and Fetch suggestions do not exist yet (P-09)", async () => {
    const r = await replenishment();
    expect(r.nextAction).toContain("Wunsch erfassen");
    expect(r.actions).toEqual({ discover: false, suggestions: false });
  });
});
