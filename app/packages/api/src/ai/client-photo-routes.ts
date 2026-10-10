import { aiMeasurementPhoto, type AiLogStore, type PhotoSource } from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "./client-auth";

/**
 * `GET /mcp/measurements/:id/photo` (US-KI-04, read right): the cleaned photo of a measurement of the connected
 * account, so the client can suggest a quality and a note as a `photo_assessment` draft. No other account's photo is
 * reachable (P-04, KI-R6); the call is logged.
 */
export function clientPhotoRoutes(
  guard: ClientGuardOptions,
  stores: { photo: PhotoSource; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  client.get("/mcp/measurements/:id/photo", clientAuthentication(guard, "read"), async (c) => {
    const { connection, rights } = c.get("ai");
    const r = await aiMeasurementPhoto(stores, {
      userId: c.get("account").id,
      connectionId: connection.id,
      rights,
      measurementId: c.req.param("id"),
      now: clock(),
    });
    if (!r.ok) return c.json(errorBody(r.error), statusFor(r.error));
    return c.body(r.value.bytes as unknown as ArrayBuffer, 200, {
      "content-type": r.value.contentType,
      "cache-control": "no-store",
    });
  });
  return client;
}
