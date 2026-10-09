import {
  REPLENISH_BUFFER,
  cuttingLight,
  zoneDistribution,
  type ZoneStockSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  ProfilePostgres,
  LocationPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Wiring in the app root (ADR 0003): the port "stock per light zone" of the wishlist is answered by the light
 * distribution of the collection (US-LIC-02), so both count specimens the same way (zones 2 to 4, `isActive`, cutting
 * light and unknown zones left out). Neither module knows the other; only the app root does.
 */
export function zoneStockFor(pool: Pool): ZoneStockSource {
  const deps = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    locations: new LocationPostgres(pool),
    zones: new ZonePostgres(pool),
    profiles: new CareProfilePostgres(pool),
  };
  const accounts = new ProfilePostgres(pool);
  return {
    async stock(userId) {
      const { zones } = await zoneDistribution(deps, userId);
      return zones.map(({ zone, count }) => ({ zoneId: zone.id, name: zone.name, count }));
    },
    /** The buffer of the account setting (US-ACC-02, US-WUN-02); the default while no profile row exists. */
    async buffer(userId) {
      return (await accounts.find(userId))?.replenishBuffer ?? REPLENISH_BUFFER;
    },
    /** The zone that does not count, the cutting light: only used to name it in the wishlist hints (FR-WUN-03). */
    async uncounted(userId) {
      const lowest = cuttingLight(await deps.zones.list(userId));
      return lowest ? [{ zoneId: lowest.id, name: lowest.name }] : [];
    },
  };
}
