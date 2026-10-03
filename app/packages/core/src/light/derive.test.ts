import { describe, expect, it } from "vitest";
import { zoneDerive, zoneDeriveReviewed } from "./derive";
import { ZONE_DEFAULT } from "./zones";
import type { LightZone } from "./types";

const zones: readonly LightZone[] = ZONE_DEFAULT.map((z, i) => ({
  id: `z${i + 1}`,
  name: z.name,
  luxCeiling: z.luxCeiling,
  ppfd: z.ppfd,
  sortOrder: z.sortOrder ?? i + 1,
}));
const derive = (lightDemandLux: number | null, standardLevel: number, softLeaf = false) =>
  zoneDerive({ lightDemandLux, standardLevel, softLeaf }, zones);
const name = (a: ReturnType<typeof derive>) => (a.kind === "zone" ? a.zone.name : a.reason);

describe("US-LIC-01 assign a species to the right light zone", () => {
  it("Given lux need and default level, when deriving, then the zone of the account applies", () => {
    expect(name(derive(15_000, 2))).toBe("Lampe 2");
    expect(name(derive(100_000, 3, true))).toBe("Lampe 3");
  });

  it("the zone is derived: a renamed zone of the account appears with its name", () => {
    const own = zones.map((z) => (z.id === "z2" ? { ...z, name: "Fensterbank" } : z));
    const a = zoneDerive({ lightDemandLux: 15_000, standardLevel: 2, softLeaf: false }, own);
    expect(a.kind === "zone" && a.zone.name).toBe("Fensterbank");
  });

  it("cutting light is never a target zone for adults (also with a small need)", () => {
    for (const need of [1, 500, 1_500, 4_000]) expect(name(derive(need, 2))).toBe("Lampe 2");
    expect(
      name(
        zoneDerive({ lightDemandLux: 500, standardLevel: 2, softLeaf: false }, [
          zones[0] as LightZone,
        ]),
      ),
    ).toBe("no_adult_zone");
  });

  it("promote only from 80 % of the lux ceiling of the current level", () => {
    const decke3 = 100_000;
    expect(name(derive(0.8 * decke3 - 1, 3))).toBe("Lampe 3");
    expect(name(derive(0.8 * decke3, 3))).toBe("Lampe 4");
  });

  it("if the need is more than 30 % below the ceiling of the higher zone, the species stays there", () => {
    const a = derive(14_000, 2);
    expect(name(a)).toBe("Lampe 2");
    expect(a.kind === "zone" && a.reason).toBe("standard");
    expect(name(derive(70_000, 2))).toBe("Lampe 3");
    expect(name(derive(69_999, 2))).toBe("Lampe 2");
  });

  it("C3 plants with a soft leaf are not promoted automatically", () => {
    const a = derive(100_000, 2, true);
    expect(name(a)).toBe("Lampe 2");
    expect(a.kind === "zone" && a.reason).toBe("soft_leaf");
    expect(name(derive(100_000, 2, false))).toBe("Lampe 4");
  });

  it("without lux need the zone stays unknown, never guessed (P-08)", () => {
    expect(derive(null, 3)).toEqual({ kind: "unknown", reason: "no_need" });
  });

  it("if the account has fewer zones than the default level, the highest available applies", () => {
    const three = zones.slice(0, 3);
    const a = zoneDerive({ lightDemandLux: 100_000, standardLevel: 4, softLeaf: false }, three);
    expect(a.kind === "zone" && a.zone.name).toBe("Lampe 3");
  });

  it("checked input: invalid values yield input.invalid with the fields", () => {
    const r = zoneDeriveReviewed({ lightDemandLux: 1.5, standardLevel: 1 }, zones);
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual([
      "lightDemandLux",
      "standardLevel",
    ]);
    const g = zoneDeriveReviewed({ lightDemandLux: 15_000, standardLevel: 2 }, zones);
    expect(g.ok && g.value.kind).toBe("zone");
  });
});
