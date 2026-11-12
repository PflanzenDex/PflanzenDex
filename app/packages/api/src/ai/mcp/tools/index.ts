// The tools of the MCP endpoint (E-04, KI-R1): each one is a thin adapter over an existing route of the AI interface
// under `/mcp/*`. A tool names the operation whose class gives its right (AI_OPERATION_CLASSES, FR-KI-12) and says how
// its arguments become the request of that route; the route keeps its guard, operation, log and limit (KI-R8). Nothing
// here reads or writes data itself.
import { rightNeeded, type AiRights } from "@pflanzendex/core";
import { ACCOUNT_TOOLS } from "./sets/account-tools";
import { AREA_TOOLS } from "./sets/areas/area-tools";
import { EQUIPMENT_TOOLS } from "./sets/areas/equipment-tools";
import { COLLECTION_TOOLS } from "./sets/collection/collection-tools";
import { SPECIMEN_WRITE_TOOLS } from "./sets/collection/specimen-write-tools";
import { RESEARCH_TOOLS } from "./sets/research-tools";
import { RULES_TOOLS } from "./sets/rules-tools";
import type { McpTool } from "./schema";

export { checkArguments } from "./schema";
export type { McpTool } from "./schema";
export { NOT_RELEASED_TOOLS } from "./not-released-tools";

/** The tools per area, in a fixed order; the rule discovery describes them by these areas (US-KI-13). */
export const MCP_TOOL_SETS: Readonly<Record<string, readonly McpTool[]>> = {
  account: ACCOUNT_TOOLS,
  research: RESEARCH_TOOLS,
  collection: [...COLLECTION_TOOLS, ...SPECIMEN_WRITE_TOOLS],
  rules: RULES_TOOLS,
  areas: AREA_TOOLS,
  equipment: EQUIPMENT_TOOLS,
};

/** The tools in a fixed order (deterministic `tools/list`). */
export const MCP_TOOLS: readonly McpTool[] = Object.values(MCP_TOOL_SETS).flat();

/** The right a tool needs, from the one table of classes (FR-KI-12); a tool without a released class is a bug. */
export function toolRight(tool: McpTool): AiRights {
  const r = rightNeeded(tool.operation);
  if (r === null) throw new Error(`Tool ${tool.name} has no released operation class`);
  return r;
}

/** The tool as `tools/list` shows it. */
export const describeTool = (t: McpTool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: {
    title: t.title,
    readOnlyHint: t.readOnly,
    destructiveHint: false,
    idempotentHint: t.readOnly,
    openWorldHint: t.needsSources === true,
  },
});
