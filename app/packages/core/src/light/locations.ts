import { defineOperation, appError, failed, ok, type Result } from "../kernel";
import { locationUpdateSchema, locationSchema, locationIdSchema, noInputSchema } from "./fields";
import type { LightLocation, LightLocationStore, LocationUsage, ZoneStore } from "./types";

/** The location every account starts with (US-ONB-02); a normal row afterwards, renamable and removable. */
export const LOCATION_DEFAULT = { name: "Zuhause", kind: "indoor" } as const;

type Response = LightLocation | "name_taken" | "not_found" | "zone_unknown";

const result = (r: Response): Result<LightLocation> => {
  if (r === "name_taken") return failed(appError("location.name_taken"));
  if (r === "not_found") return failed(appError("location.not_found"));
  if (r === "zone_unknown") return failed(appError("light_zone.not_found"));
  return ok(r);
};

/** A location belongs to at most one zone; without a zone it appears in the hints. */
export const locationSetUp = (locations: LightLocationStore) =>
  defineOperation({
    name: "location.set_up",
    schema: locationSchema,
    run: async (context, input) => result(await locations.create(context.userId, input)),
  });

/** Rename, change zone or kind; the id stays, specimens refer to it (not to the name). */
export const locationUpdate = (locations: LightLocationStore) =>
  defineOperation({
    name: "location.update",
    schema: locationUpdateSchema,
    run: async (context, { id, ...values }) =>
      result(await locations.update(context.userId, id, values)),
  });

/**
 * The default location for an account without locations (US-ONB-02). It stands under the first lamp for adult plants
 * (the second zone by order, a starting value) so that nothing is reported as missing; without zones it has none.
 */
export const locationDefault = (locations: LightLocationStore, zones: ZoneStore) =>
  defineOperation({
    name: "location.default",
    schema: noInputSchema,
    run: async (context) => {
      if ((await locations.list(context.userId)).length > 0)
        return failed(appError("location.not_empty"));
      const own = [...(await zones.list(context.userId))].sort((a, b) => a.sortOrder - b.sortOrder);
      const r = await locations.create(context.userId, {
        ...LOCATION_DEFAULT,
        lightZoneId: own[1]?.id ?? null,
      });
      return result(r);
    },
  });

/** Removes a location only if nothing points to it; otherwise it stays and the keeper learns why (P-10). */
export const locationDelete = (locations: LightLocationStore, usages: readonly LocationUsage[]) =>
  defineOperation({
    name: "location.delete",
    schema: locationIdSchema,
    run: async (context, { id }) => {
      const users = (await Promise.all(usages.map((q) => q.user(context.userId, id)))).flat();
      if (users.length > 0) return failed(appError("location.in_use"));
      const r = await locations.remove(context.userId, id);
      if (r === "in_use") return failed(appError("location.in_use"));
      return r === "deleted" ? ok({ id }) : failed(appError("location.not_found"));
    },
  });
