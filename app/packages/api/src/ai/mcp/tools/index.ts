// The tools of the MCP endpoint (E-04, KI-R1): each one is a thin adapter over an existing route of the AI interface
// under `/mcp/*`. A tool names the operation whose class gives its right (AI_OPERATION_CLASSES, FR-KI-12) and says how
// its arguments become the request of that route; the route keeps its guard, operation, log and limit (KI-R8). Nothing
// here reads or writes data itself.
import { rightNeeded, type AiRights } from "@pflanzendex/core";
import { ACCOUNT_TOOLS } from "./account-tools";
import { RESEARCH_TOOLS } from "./research-tools";
import type { McpTool } from "./schema";

export { checkArguments } from "./schema";
export type { McpTool } from "./schema";

/** The tools in a fixed order (deterministic `tools/list`). */
export const MCP_TOOLS: readonly McpTool[] = [...ACCOUNT_TOOLS, ...RESEARCH_TOOLS];

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
