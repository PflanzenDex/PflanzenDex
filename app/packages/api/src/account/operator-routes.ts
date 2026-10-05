import { randomBytes } from "node:crypto";
import { invitationCreate, operatorOverview, registrationSetMode } from "@pflanzendex/core";
import { AccessPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const OPERATOR_PATHS = ["/operator"] as const;

/**
 * The operator area (US-ACC-05), for the operator only: the operations check the role, the database checks it again
 * (P-04). It shows counts and invitation states, never content of an account (P-05).
 * - GET /operator/overview: accounts, active accounts, cost per user (unknown, P-08), mode, invitations
 * - PUT /operator/registration `{ invitationOnly }`: registration with or without invitation code
 * - POST /operator/invitations `{ validForDays? }`: 201 with the code, shown this once
 */
export function operatorRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const access = new AccessPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const create = invitationCreate({ access, random: (n) => randomBytes(n), now: clock });
  const setMode = registrationSetMode({ access });
  const routes = new Hono<AuthEnv>();
  routes.get("/operator/overview", async (c) => {
    const r = await operatorOverview({ access }, c.get("account").id);
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.put("/operator/registration", async (c) =>
    write(c, deps, setMode, { input: await body(c) }),
  );
  routes.post("/operator/invitations", async (c) => {
    const response = await write(c, deps, create, { input: await body(c), success: 201 });
    response.headers.set("cache-control", "no-store");
    return response;
  });
  return routes;
}
