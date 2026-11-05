import {
  localToday,
  measurementView,
  speciesLoad,
  speciesSearch,
  specimenArchived,
  specimenCards,
  specimenList,
  specimenLoad,
  type CollectionReadSource,
  type SpecimenCard,
  type SpecimenItem,
} from "@pflanzendex/core";
import {
  LocationPostgres,
  MeasurementsPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { cardsDependencies, type SpecimenOptions } from "../specimens/specimens-routes";

/** The archive of the app (`specimenArchived`) as items; marker and species id come from the same rows. */
async function archivedItems(
  specimens: SpecimenPostgres,
  species: SpeciesPostgres,
  userId: string,
): Promise<SpecimenItem[]> {
  const [entries, rows] = await Promise.all([
    specimenArchived({ specimens, species }, userId),
    specimens.list(userId),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    speciesId: byId.get(e.id)?.speciesId ?? "",
    speciesName: e.speciesName,
    marker: byId.get(e.id)?.marker ?? null,
    status: "archived",
    location: null,
    lightZone: null,
    lightZoneSource: null,
    caughtAt: e.caughtAt,
    archivedAt: e.archivedAt,
  }));
}

/** A card of the app (`specimenCards`) as an item. */
const cardItem = (c: SpecimenCard): SpecimenItem => ({
  id: c.id,
  name: c.name,
  speciesId: c.speciesId,
  speciesName: c.speciesName,
  marker: c.marker,
  status: c.status,
  location: c.location,
  lightZone: c.lightZone,
  lightZoneSource: c.lightZoneSource,
  caughtAt: c.caughtAt,
  archivedAt: null,
});

/**
 * The reads of the AI interface over the catalog and the collection (US-KI-11, KI-R10): every method calls the same
 * function as the app's own route (FR-KI-14): `GET /species` (`speciesSearch`), `GET /species/:id` (`speciesLoad`),
 * `GET /specimens/cards` (`specimenCards`), `GET /specimens/archived` (`specimenArchived`), `GET /specimens/:id`
 * (`specimenLoad`), `GET /locations`, `GET /light-zones` and `GET /specimens/:id/measurements` (`measurementView`).
 * No second code path; everything runs under the account (P-04).
 */
export function collectionReadSourceFor(
  pool: Pool,
  opt: SpecimenOptions = {},
): CollectionReadSource {
  const species = new SpeciesPostgres(pool);
  const specimens = new SpecimenPostgres(pool);
  const locations = new LocationPostgres(pool);
  const zones = new ZonePostgres(pool);
  const measurements = new MeasurementsPostgres(pool);
  const cards = cardsDependencies(pool, specimens, opt);
  const clock = opt.clock ?? (() => new Date());

  return {
    async searchSpecies(userId, text) {
      const [{ species: hits }, mine] = await Promise.all([
        speciesSearch(species, userId, text),
        specimenList(specimens, userId),
      ]);
      const count = (id: string) => mine.filter((s) => s.speciesId === id).length;
      return hits.map((s) => ({
        id: s.id,
        latinName: s.latinName,
        germanName: s.germanName,
        synonyms: s.synonyms,
        reviewStatus: s.reviewStatus,
        own: s.own,
        specimens: count(s.id),
      }));
    },
    species: (userId, id) => speciesLoad(species, userId, id),
    async specimens(userId, timeZone) {
      const [active, archived] = await Promise.all([
        specimenCards(cards, userId, localToday(clock(), timeZone)),
        archivedItems(specimens, species, userId),
      ]);
      return [...active.map(cardItem), ...archived];
    },
    specimen: (userId, id) => specimenLoad(specimens, userId, id),
    locations: (userId) => locations.list(userId),
    zones: (userId) => zones.list(userId),
    measurements: (userId, id) => measurementView({ measurements, specimens, species }, userId, id),
  };
}
