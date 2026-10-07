import { createHash, randomUUID } from "node:crypto";
import {
  appError,
  measurementView,
  measurementRecord,
  measurementPhoto,
  MEDIA_LIMITS,
  imageStorage,
  type ImageProcessor,
  type ObjectStore,
} from "@pflanzendex/core";
import {
  SpeciesPostgres,
  SpecimenPostgres,
  IdempotencyPostgres,
  MeasurementsPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CARE_PATHS = [
  "/specimens/:id/measurements",
  "/specimens/:id/measurements/photo",
] as const;

export type CareOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
  /** Object store and image processing for measurement photos (TE-05); without them the photo route answers 502. */
  media?: { readonly store: ObjectStore; readonly processor: ImageProcessor };
};

/**
 * Measurements of a specimen (US-WAC-01). Writing goes only through `measurement.record` (P-03, with
 * `Idempotency-Key`); reading returns only measurements of the own account, a foreign or unknown specimen looks the
 * same: 404 (P-04).
 */
export function careRoutes(pool: Pool, opt: CareOptions = {}): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const measurements = new MeasurementsPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const record = measurementRecord({
    measurements,
    specimens,
    clock: opt.clock ?? (() => new Date()),
  });
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens/:id/measurements", async (c) => {
    const a = await measurementView(
      { measurements, specimens, species: new SpeciesPostgres(pool) },
      c.get("account").id,
      c.req.param("id"),
    );
    return a ? c.json(a) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  routes.post("/specimens/:id/measurements", async (c) =>
    write(c, deps, record, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
      success: 201,
    }),
  );
  routes.post("/specimens/:id/measurements/photo", async (c) => {
    if (!opt.media) return c.json(errorBody(appError("media.storage_unavailable")), 502);
    // Refuse before reading when the announced size is already too large (the pipeline checks the real size again).
    if (Number(c.req.header("content-length") ?? 0) > MEDIA_LIMITS.uploadMaxBytes)
      return c.json(errorBody(appError("media.too_large")), 413);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const contentType = (c.req.header("content-type") ?? "").split(";")[0]?.trim() ?? "";
    const photo = measurementPhoto({
      measurements,
      specimens,
      storage: imageStorage(opt.media),
      newName: randomUUID,
      clock: opt.clock ?? (() => new Date()),
      upload: { bytes, contentType },
    });
    return write(c, deps, photo, {
      input: {
        specimenId: c.req.param("id"),
        timeZone: c.req.query("timeZone"),
        date: c.req.query("date"),
        replace: c.req.query("replace") === "true" ? true : undefined,
        digest: createHash("sha256").update(bytes).digest("hex"),
      },
      success: 201,
    });
  });
  return routes;
}
