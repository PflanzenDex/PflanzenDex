import { defineOperation, appError, failed, ok, type Result } from "../kernel";
import { locationUpdateSchema, locationSchema } from "./fields";
import type { LightLocation, LightLocationStore } from "./types";

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
