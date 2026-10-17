import { defineOperation, appError, failed, ok, type Result, shape } from "../kernel";
import { zoneUpdateSchema, zoneIdSchema, zoneSchema } from "./fields";
import type { LightZone, ZoneUsage, ZoneStore, ZoneValues } from "./types";

/** Default light zones from the specification (03-light-and-locations.md), applies to new accounts. */
export const ZONE_DEFAULT: readonly ZoneValues[] = [
  { name: "Lampe 1", luxCeiling: 1_500, ppfd: 36, sortOrder: 1 },
  { name: "Lampe 2", luxCeiling: 15_000, ppfd: 300, sortOrder: 2 },
  { name: "Lampe 3", luxCeiling: 100_000, ppfd: 1_600, sortOrder: 3 },
  { name: "Lampe 4", luxCeiling: 110_000, ppfd: 2_000, sortOrder: 4 },
];

const save = (r: LightZone | "name_taken" | "not_found"): Result<LightZone> => {
  if (r === "name_taken") return failed(appError("light_zone.name_taken"));
  if (r === "not_found") return failed(appError("light_zone.not_found"));
  return ok(r);
};

export const lightZoneCreate = (zones: ZoneStore) =>
  defineOperation({
    name: "light_zone.create",
    schema: zoneSchema,
    run: async (context, input) => save(await zones.create(context.userId, input)),
  });

/** Rename and change: the id stays, assignments refer to it and remain untouched. */
export const lightZoneUpdate = (zones: ZoneStore) =>
  defineOperation({
    name: "light_zone.update",
    schema: zoneUpdateSchema,
    run: async (context, { id, ...values }) => save(await zones.update(context.userId, id, values)),
  });

/**
 * Deletes a zone only if nobody uses it; otherwise the error names all users (P-10).
 * `usages` are all sources that can occupy a zone (locations, later specimens and species).
 */
export const lightZoneDelete = (zones: ZoneStore, usages: readonly ZoneUsage[]) => {
  const user = async (userId: string, id: string) =>
    (await Promise.all(usages.map((q) => q.user(userId, id)))).flat();
  const occupied = async (userId: string, id: string) =>
    failed(appError("light_zone.in_use", { data: await user(userId, id) }));
  return defineOperation({
    name: "light_zone.delete",
    schema: zoneIdSchema,
    run: async (context, { id }) => {
      const own = (await zones.list(context.userId)).some((z) => z.id === id);
      if (!own) return failed(appError("light_zone.not_found"));
      if ((await user(context.userId, id)).length > 0) return occupied(context.userId, id);
      const r = await zones.remove(context.userId, id);
      if (r === "in_use") return occupied(context.userId, id);
      return r === "deleted" ? ok({ id }) : failed(appError("light_zone.not_found"));
    },
  });
};

/** Creates the four lamps of the default, but only for an account without zones (nothing is overwritten). */
export const lightZoneDefault = (zones: ZoneStore) =>
  defineOperation({
    name: "light_zone.default",
    schema: shape({}),
    run: async (context) => {
      if ((await zones.list(context.userId)).length > 0)
        return failed(appError("light_zone.not_empty"));
      const created: LightZone[] = [];
      for (const values of ZONE_DEFAULT) {
        const r = await zones.create(context.userId, values);
        if (r === "name_taken") return failed(appError("light_zone.name_taken"));
        created.push(r);
      }
      return ok(created as readonly LightZone[]);
    },
  });
