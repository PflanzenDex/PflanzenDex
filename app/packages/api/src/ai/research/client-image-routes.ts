import {
  aiCheckImageSource,
  checkCommonsImage,
  type AiLogStore,
  type SourceClient,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../guard/client-auth";

/**
 * Research for the AI client (US-KI-05, AI token, read right): `GET /mcp/image-source?url=` lets the server check an
 * image address (reachability, license; operation `check_image_source`). The answer says what the server found; the
 * client cannot claim an image as checked.
 */
export function clientImageRoutes(
  guard: ClientGuardOptions,
  stores: { sources: SourceClient; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  client.get("/mcp/image-source", clientAuthentication(guard, "read"), async (c) => {
    const { connection, rights } = c.get("ai");
    const r = await aiCheckImageSource(
      { images: { check: (a) => checkCommonsImage(stores.sources, a) }, log: stores.log },
      {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        now: clock(),
        imageUrl: c.req.query("url"),
      },
    );
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  return client;
}
