import { describe, expect, it } from "vitest";
import { InMemoryLight } from "./test-helpers";
import type { ZoneUsage } from "./types";

type Fixture = { usage: ZoneUsage; zoneId: string; ownerId: string; strangerId: string };

/**
 * Contract of the port `ZoneUsage` (ADR 0003, US-LIC-05): a source names who occupies a zone of one account and
 * never leaks the usage of another account (P-04). Every implementation supplies a fixture with one user.
 */
export function zoneUsageContract(name: string, make: () => Promise<Fixture> | Fixture) {
  describe(`ZoneUsage contract · ${name}`, () => {
    it("names the users of the zone with kind, id and name", async () => {
      const { usage, zoneId, ownerId } = await make();
      const users = await usage.user(ownerId, zoneId);
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({
        kind: expect.any(String),
        id: expect.any(String),
        name: expect.any(String),
      });
    });

    it("another account sees no users of the zone (P-04)", async () => {
      const { usage, zoneId, strangerId } = await make();
      expect(await usage.user(strangerId, zoneId)).toEqual([]);
    });

    it("an unknown zone has no users", async () => {
      const { usage, ownerId } = await make();
      expect(await usage.user(ownerId, "00000000-0000-4000-8000-0000000000ff")).toEqual([]);
    });
  });
}

zoneUsageContract("locations (in-memory)", async () => {
  const light = new InMemoryLight();
  const zone = await light.zoneAdapter().create("owner", {
    name: "Bright",
    luxCeiling: 20000,
    ppfd: null,
    sortOrder: null,
  });
  if (typeof zone === "string") throw new Error(zone);
  await light
    .locationAdapter()
    .create("owner", { name: "Window", lightZoneId: zone.id, kind: "indoor" });
  return {
    usage: light.locationUsage(),
    zoneId: zone.id,
    ownerId: "owner",
    strangerId: "stranger",
  };
});
