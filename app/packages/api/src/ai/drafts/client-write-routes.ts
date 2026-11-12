import {
  aiSpecimenWrite,
  type AiLogStore,
  type CollectionReadSource,
  type DraftStore,
  type SpecimenWrite,
  type SpecimenWriteSource,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, keyMissing, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../guard/client-auth";

/** The path of each write tool; `:specimen` is the specimen's id or readable name (FR-KI-15). */
export const SPECIMEN_WRITE_PATHS: Readonly<Record<SpecimenWrite, string>> = {
  create_specimen: "/mcp/specimens",
  set_specimen_marker: "/mcp/specimens/:specimen/marker",
  correct_catch_date: "/mcp/specimens/:specimen/catch-date",
  set_specimen_location: "/mcp/specimens/:specimen/location",
  set_specimen_light_zone: "/mcp/specimens/:specimen/light-zone",
  repot_specimen: "/mcp/specimens/:specimen/repot",
  restore_specimen: "/mcp/specimens/:specimen/restore",
};

const objectOf = (b: unknown): Record<string, unknown> =>
  b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};

/**
 * Keeping the specimens through the AI client (US-KI-14, AI token): `POST` on the paths above with `Idempotency-Key`.
 * With the right "write" the app's own operation runs at once (KI-R10) and the answer shows the specimen before and
 * after; with "create drafts" a draft of the same content arises (201) and the answer names the right to request
 * (step-up, US-KI-07). A foreign or unknown reference answers `not_found` (P-04).
 */
export function clientWriteRoutes(
  guard: ClientGuardOptions,
  stores: {
    collection: CollectionReadSource;
    writes: SpecimenWriteSource;
    drafts: DraftStore;
    log: AiLogStore;
  },
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  const deps = {
    source: stores.collection,
    writes: stores.writes,
    drafts: stores.drafts,
    log: stores.log,
  };
  for (const [write, path] of Object.entries(SPECIMEN_WRITE_PATHS) as [SpecimenWrite, string][])
    client.post(path, clientAuthentication(guard, "drafts"), async (c) => {
      const key = c.req.header("idempotency-key");
      if (!key) return keyMissing(c);
      const { connection, rights } = c.get("ai");
      const body = objectOf(await c.req.json().catch(() => null));
      const specimen = c.req.param("specimen");
      const r = await aiSpecimenWrite(deps, write, {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        now: clock(),
        input: specimen === undefined ? body : { ...body, specimen },
        key,
      });
      if (!r.ok) return c.json(errorBody(r.error), statusFor(r.error));
      const created = r.value.mode === "draft" ? r.value.created : specimen === undefined;
      return c.json(r.value, created ? 201 : 200);
    });
  return client;
}
