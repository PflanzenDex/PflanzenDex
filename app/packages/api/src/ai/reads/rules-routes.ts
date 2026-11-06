import {
  SPECIES_NAMING_RULE,
  aiCheckSpeciesName,
  aiDescribeRules,
  checkSpeciesName,
  type AiLogStore,
  type RulesSource,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../guard/client-auth";
import { MCP_TOOL_SETS } from "../mcp/tools";

/**
 * What the rule discovery describes (US-KI-13): the tools offered per area with the input schema derived from their
 * operation's check (FR-KI-17), and the naming rule and dry check of the catalog. `sources` says whether the tools that
 * need the source client are offered, so the description lists exactly what `tools/list` lists.
 */
export function rulesSource(sources: boolean): RulesSource {
  const areas = Object.entries(MCP_TOOL_SETS).map(([area, tools]) => ({
    area,
    operations: tools
      .filter((t) => sources || !t.needsSources)
      .map((t) => ({
        tool: t.name,
        title: t.title,
        operation: t.operation,
        inputSchema: t.inputSchema,
        readOnly: t.readOnly,
      })),
  }));
  return { areas, naming: SPECIES_NAMING_RULE, checkName: checkSpeciesName };
}

/**
 * The rule discovery for the AI client (US-KI-13, read right, AI token): `GET /mcp/rules` and the dry name check
 * `GET /mcp/rules/species-name?name=…`. Nothing is account data; each call is logged once (FR-KI-19).
 */
export function clientRulesRoutes(
  guard: ClientGuardOptions,
  stores: { log: AiLogStore },
  sources: boolean,
  clock: () => Date,
): Hono<AiEnv> {
  const client = new Hono<AiEnv>();
  const deps = { rules: rulesSource(sources), log: stores.log };
  const route = (path: string, read: typeof aiDescribeRules | typeof aiCheckSpeciesName) =>
    client.get(path, clientAuthentication(guard, "read"), async (c) => {
      const { connection, rights } = c.get("ai");
      const r = await read(deps, {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        now: clock(),
        input: c.req.query(),
      });
      return r.ok ? c.json(r.value as object) : c.json(errorBody(r.error), statusFor(r.error));
    });
  route("/mcp/rules", aiDescribeRules);
  route("/mcp/rules/species-name", aiCheckSpeciesName);
  return client;
}
