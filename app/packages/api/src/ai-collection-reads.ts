import {
  careProfileView,
  catalogGaps,
  difficultyOverview,
  lightOverview,
  myCorrections,
  ok,
  positionThresholdsOrDefault,
  specimenHints,
  zoneDistribution,
  type AppAreaReadSource,
  type AreaReadSource,
  type Result,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  CatalogGapsPostgres,
  CorrectionPostgres,
  LocationPostgres,
  ProfilePostgres,
  ReviewPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { unlockListFor } from "./account";
import { careAreaReadsFor, type AreaReadOptions } from "./ai-care-reads";
import type { FeatureAccess } from "./kernel";

type CollectionAreas =
  | "list_care_profiles"
  | "get_light_distribution"
  | "get_difficulty_comparison"
  | "list_collection_hints"
  | "list_catalog_gaps"
  | "list_my_corrections"
  | "list_unlocks"
  | "get_profile";

const value = async <T extends object>(r: Promise<Result<T>>): Promise<Result<object>> => r;

/**
 * Collection views, catalog and account for the AI client (US-KI-12, KI-R10): the same functions as `GET /care-profiles`,
 * `/specimens/distribution`, `/specimens/light-overview`, `/specimens/difficulty`, `/specimens/hints`, `/catalog/gaps`,
 * `/catalog/corrections/mine` and `/onboarding/unlocks` (FR-KI-14). From the profile only the time zone and the display
 * name; changing them stays human-only (FR-KI-22). Everything runs under the account (P-04).
 */
function collectionAreaReadsFor(
  pool: Pool,
  opt: AreaReadOptions & { features: FeatureAccess },
): Pick<AreaReadSource, CollectionAreas> {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const profiles = new CareProfilePostgres(pool);
  const zones = new ZonePostgres(pool);
  const accounts = new ProfilePostgres(pool);
  const corrections = new CorrectionPostgres(pool);
  const derived = { specimens, species, locations: new LocationPostgres(pool), zones, profiles };
  const unlocks = unlockListFor(pool, { clock: opt.clock, features: opt.features });
  return {
    list_care_profiles: async (u) =>
      ok({
        entries: await careProfileView({ specimens, species, profiles, zones, merged: species }, u),
      }),
    get_light_distribution: async (u) => {
      const stored = (await accounts.find(u))?.positionThresholds;
      return ok({
        distribution: await zoneDistribution(derived, u),
        overview: await lightOverview(derived, u, positionThresholdsOrDefault(stored)),
      });
    },
    get_difficulty_comparison: async (u) => ok(await difficultyOverview(derived, u)),
    list_collection_hints: async (u) => ok({ hints: await specimenHints(derived, u) }),
    list_catalog_gaps: (u) =>
      value(catalogGaps(new CatalogGapsPostgres(pool), new ReviewPostgres(pool), u)),
    list_my_corrections: async (u) => {
      const r = await myCorrections(corrections, u);
      return r.ok ? ok({ corrections: r.value }) : r;
    },
    list_unlocks: async (u, q) => ok(await unlocks(u, q.timeZone ?? "UTC")),
    get_profile: async (u) => {
      const p = await accounts.find(u);
      return ok({ displayName: p?.displayName ?? null, timeZone: p?.timeZone ?? null });
    },
  };
}

/** Every area the app answers for the AI client (US-KI-12), over the app's own read functions. */
export function appAreaReadsFor(
  pool: Pool,
  opt: Omit<AreaReadOptions, "clock"> & {
    clock?: (() => Date) | undefined;
    features: FeatureAccess;
  },
): AppAreaReadSource {
  const all = { ...opt, clock: opt.clock ?? (() => new Date()) };
  return { ...careAreaReadsFor(pool, all), ...collectionAreaReadsFor(pool, all) };
}
