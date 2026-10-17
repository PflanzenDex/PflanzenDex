import type { AiLogStore, PhotoSource, SourceClient } from "@pflanzendex/core";
import { Hono } from "hono";
import { clientPhotoRoutes } from "./client-photo-routes";
import type { AiEnv, ClientGuardOptions } from "../client-auth";
import { clientImageRoutes } from "./client-image-routes";

/**
 * Read-only research of the AI client (US-KI-05, US-KI-04): the photo of a measurement and, when the source client for
 * Commons is configured (TE-09), the image source check.
 */
export function clientResearchRoutes(
  guard: ClientGuardOptions,
  stores: { photo: PhotoSource; sources?: SourceClient | undefined; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const { photo, sources, log } = stores;
  const routes = new Hono<AiEnv>();
  routes.route("/", clientPhotoRoutes(guard, { photo, log }, clock));
  if (sources) routes.route("/", clientImageRoutes(guard, { sources, log }, clock));
  return routes;
}
