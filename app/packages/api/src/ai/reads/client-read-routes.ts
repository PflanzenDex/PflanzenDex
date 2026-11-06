import {
  AREA_NAMES,
  NOT_RELEASED_READS,
  aiAreaRead,
  aiGetSpecies,
  aiNotReleased,
  aiGetSpecimen,
  aiListLightZones,
  aiListLocations,
  aiListMeasurements,
  aiListSpecimens,
  aiSearchSpecies,
  type AiLogStore,
  type AreaReadSource,
  type NotReleasedRead,
  type CollectionReadSource,
  type ReadCall,
  type Result,
} from "@pflanzendex/core";
import { Hono, type Context } from "hono";
import { errorBody, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../guard/client-auth";
import { AREA_PATHS, notReleasedPath } from "./area-paths";

type Read = (
  deps: { source: CollectionReadSource; areas: AreaReadSource; log: AiLogStore },
  call: ReadCall,
) => Promise<Result<unknown>>;

/** Numbers of the query as numbers, so the operation's schema checks them (a non-number stays text and is refused). */
const INTEGERS = new Set(["offset", "limit"]);
function inputOf(c: Context<AiEnv>, params: Record<string, string>) {
  const query = Object.entries(c.req.query()).map(([k, v]) => [
    k,
    INTEGERS.has(k) && /^\d{1,7}$/.test(v) ? Number(v) : v,
  ]);
  return { ...Object.fromEntries(query), ...params };
}

/**
 * The catalog and the collection for the AI client (US-KI-11, read right, AI token): species search and profile,
 * specimens, one specimen, locations, light zones and the measurements of a specimen. References in the path are an id
 * or a readable name (FR-KI-15); lists take `offset` and `limit` (FR-KI-16). Each route runs the read operation of
 * `core` over the same functions as the app's own routes (KI-R10, FR-KI-14); a foreign id answers 404 (P-04).
 * Every other area (US-KI-12) has its route in `AREA_PATHS`; friends' data, sharing, offers, swaps and recommendations
 * answer `ai.not_released` under `/mcp/not-released/:subject` (FR-KI-10).
 */
export function clientReadRoutes(
  guard: ClientGuardOptions,
  stores: { collection: CollectionReadSource; areas: AreaReadSource; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  const deps = { source: stores.collection, areas: stores.areas, log: stores.log };
  const route = (path: string, read: Read) =>
    client.get(path, clientAuthentication(guard, "read"), async (c) => {
      const { connection, rights } = c.get("ai");
      const r = await read(deps, {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        now: clock(),
        input: inputOf(c, c.req.param() as Record<string, string>),
      });
      return r.ok ? c.json(r.value as object) : c.json(errorBody(r.error), statusFor(r.error));
    });
  route("/mcp/species", aiSearchSpecies);
  route("/mcp/species/:species", aiGetSpecies);
  route("/mcp/specimens", aiListSpecimens);
  route("/mcp/specimens/:specimen", aiGetSpecimen);
  route("/mcp/specimens/:specimen/measurements", aiListMeasurements);
  route("/mcp/locations", aiListLocations);
  route("/mcp/light-zones", aiListLightZones);
  for (const name of AREA_NAMES) route(AREA_PATHS[name], aiAreaRead(name));
  for (const subject of Object.keys(NOT_RELEASED_READS) as NotReleasedRead[])
    route(notReleasedPath(subject), (d, call) =>
      aiNotReleased(d, call, NOT_RELEASED_READS[subject]),
    );
  return client;
}
