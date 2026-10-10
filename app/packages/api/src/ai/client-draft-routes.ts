import {
  aiProposeDraft,
  type AiLogStore,
  type DraftStore,
  type DraftTypes,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "./client-auth";

/** Draft routes of the AI client (AI token): deliver a draft (right "create drafts") and list the known types. */
export function clientDraftRoutes(
  guard: ClientGuardOptions,
  stores: { drafts: DraftStore; types: DraftTypes; log: AiLogStore },
  clock: () => Date,
): Hono<AiEnv> {
  const { drafts, types, log } = stores;
  const client = new Hono<AiEnv>();
  // US-KI-09: content results arrive as drafts (right "create drafts"); the keeper adopts them in the app (KI-R3).
  client.post("/mcp/drafts", clientAuthentication(guard, "drafts"), async (c) => {
    const { connection, rights } = c.get("ai");
    const input: unknown = await c.req.json().catch(() => null);
    const r = await aiProposeDraft(
      { drafts, types, log },
      { userId: c.get("account").id, connectionId: connection.id, rights, input, now: clock() },
    );
    return r.ok
      ? c.json({ ...r.value.draft, created: r.value.created }, r.value.created ? 201 : 200)
      : c.json(errorBody(r.error), statusFor(r.error));
  });
  client.get("/mcp/draft-types", clientAuthentication(guard, "read"), (c) =>
    c.json({ types: Object.keys(types) }),
  );
  return client;
}
