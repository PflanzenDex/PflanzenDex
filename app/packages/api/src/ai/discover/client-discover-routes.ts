import {
  aiDiscoverDecide,
  aiDiscoverSuggestions,
  isTimeZone,
  appError,
  type AiLogStore,
  type DiscoverSource,
  type DraftStore,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../guard/client-auth";

const bad = (field: string) =>
  errorBody(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));

/**
 * Discover for the AI client (US-ENT-08, AI token): `GET /mcp/discover/suggestions?timeZone=&deck=&zone=` returns the
 * deck of the view (read right); `POST /mcp/discover/decisions` `{species, decision, timeZone}` is "Yes"/"No"/"Later":
 * with the right "write" it runs `discover.decide` at once, with "create drafts" it arrives as a draft (KI-R3, KI-R8).
 */
export function clientDiscoverRoutes(
  guard: ClientGuardOptions,
  stores: { discover: DiscoverSource; drafts: DraftStore; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  client.get("/mcp/discover/suggestions", clientAuthentication(guard, "read"), async (c) => {
    const { connection, rights } = c.get("ai");
    const timeZone = c.req.query("timeZone");
    const deck = Number(c.req.query("deck") ?? "1");
    const zoneQuery = c.req.query("zone");
    const zone = zoneQuery === undefined ? undefined : Number(zoneQuery);
    if (!isTimeZone(timeZone)) return c.json(bad("timeZone"), 400);
    if (!Number.isInteger(deck) || deck < 1 || deck > 1000) return c.json(bad("deck"), 400);
    if (zone !== undefined && !(Number.isInteger(zone) && zone >= 2 && zone <= 4))
      return c.json(bad("zone"), 400);
    const r = await aiDiscoverSuggestions(stores, {
      userId: c.get("account").id,
      connectionId: connection.id,
      rights,
      now: clock(),
      timeZone,
      deck,
      ...(zone === undefined ? {} : { zone }),
    });
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  client.post("/mcp/discover/decisions", clientAuthentication(guard, "drafts"), async (c) => {
    const { connection, rights } = c.get("ai");
    const input: unknown = await c.req.json().catch(() => null);
    const r = await aiDiscoverDecide(stores, {
      userId: c.get("account").id,
      connectionId: connection.id,
      rights,
      now: clock(),
      input,
      key: c.req.header("idempotency-key") ?? crypto.randomUUID(),
    });
    if (!r.ok) return c.json(errorBody(r.error), statusFor(r.error));
    return c.json(r.value, r.value.mode === "draft" && r.value.created ? 201 : 200);
  });
  return client;
}
