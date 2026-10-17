import { equipmentLinkAgent, equipmentSetSupply, plantAgents } from "@pflanzendex/core";
import { EquipmentPostgres, type IdempotencyPostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * Consumables and supply (US-EQU-05). Reading lists the plant agents with their supply and the text of `Treatment.Agent`
 * they are linked to, derived on every request (P-01). Writing goes only through the validating operations
 * `equipment.set_supply` and `equipment.link_agent` (P-03, with `Idempotency-Key`). Private to the account (P-04, P-05).
 */
export function addSupplyRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
): void {
  const equipment = new EquipmentPostgres(pool);
  const setSupply = equipmentSetSupply({ equipment });
  const linkAgent = equipmentLinkAgent({ equipment });
  routes.get("/equipment/agents", async (c) =>
    c.json({ agents: await plantAgents({ equipment }, c.get("account").id) }),
  );
  routes.post("/equipment/:id/supply", async (c) =>
    write(c, deps, setSupply, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/equipment/:id/agent-link", async (c) =>
    write(c, deps, linkAgent, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
}
