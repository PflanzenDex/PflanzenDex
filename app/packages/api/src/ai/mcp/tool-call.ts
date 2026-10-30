// Running a tool of the MCP endpoint (E-04): structural check of the arguments, then the tool's route with the caller's
// token; the route's answer becomes the tool result (KI-R1, KI-R8). Nothing here touches data itself.
import { appError, rankOf } from "@pflanzendex/core";
import type { Context, Hono } from "hono";
import { errorBody } from "../../kernel";
import type { AiEnv } from "../guard/client-auth";
import { RPC } from "./protocol";
import { checkArguments, MCP_TOOLS, toolRight, type McpTool } from "./tools";

/** What the endpoint needs besides the guard: the routes the tools call, the allowed origins and the server's version. */
export interface McpOptions {
  /** The client routes of the AI interface (`/mcp/*`); the tools call them with the caller's token. */
  readonly routes: Hono<AiEnv>;
  /** Origins a browser may send (DNS rebinding, transport spec); a request without `Origin` is allowed. */
  readonly origins: readonly string[];
  readonly version: string;
  /** Whether the image check is wired (Commons source client, TE-09). */
  readonly sources: boolean;
}

export type Answer =
  { readonly result: object } | { readonly error: { code: number; message: string } } | Response;

/** A failed route call as a tool error (isError) with the stable code, never as a protocol error. */
const toolError = (body: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(body) }],
  structuredContent: body,
  isError: true,
});

/** The route's answer as a tool result: JSON as text plus structured content, an image as image content. */
async function toolResult(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) {
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { content: [{ type: "image", data, mimeType: type.split(";")[0] }], isError: false };
  }
  const body: unknown = await res.json().catch(() => errorBody(appError("system.unexpected")));
  if (!res.ok) return toolError(body);
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    isError: false,
  };
}

/**
 * Runs one tool through its route with the caller's own token, so the route's guard, operation, log and limit apply
 * unchanged (KI-R1, KI-R8). A refusal for want of the token's scope is the HTTP 403 of the route with its
 * `WWW-Authenticate` challenge, so the client can step up; any other refusal is a tool error with its code.
 */
async function runTool(
  c: Context<AiEnv>,
  opt: McpOptions,
  tool: McpTool,
  args: Record<string, unknown>,
) {
  const req = tool.request(args);
  const headers: Record<string, string> = { authorization: c.req.header("authorization") ?? "" };
  if (req.body !== undefined) headers["content-type"] = "application/json";
  if (req.idempotencyKey) headers["idempotency-key"] = req.idempotencyKey;
  const res = await opt.routes.request(req.path, {
    method: req.method,
    headers,
    ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
  });
  const keeperAllows = rankOf(c.get("ai").connection.rights) >= rankOf(toolRight(tool));
  if (res.status === 403 && keeperAllows && res.headers.has("www-authenticate")) return res;
  return toolResult(res);
}

export function available(opt: McpOptions) {
  return MCP_TOOLS.filter((t) => opt.sources || !t.needsSources);
}

export async function callTool(
  c: Context<AiEnv>,
  opt: McpOptions,
  params: Record<string, unknown>,
): Promise<Answer> {
  const { name, arguments: raw = {} } = params;
  const tool = available(opt).find((t) => t.name === name);
  if (!tool)
    return { error: { code: RPC.invalidParams, message: `Unknown tool: ${String(name)}` } };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { error: { code: RPC.invalidParams, message: "arguments must be an object" } };
  const args = raw as Record<string, unknown>;
  const problems = checkArguments(tool, args);
  if (problems.length) {
    const details = problems.map((p) => ({ field: p.field, code: "input.invalid" as const }));
    const data = { problems: problems.map((p) => `${p.field} ${p.problem}`) };
    return { result: toolError(errorBody(appError("input.invalid", { details, data }))) };
  }
  const r = await runTool(c, opt, tool, args);
  return r instanceof Response ? r : { result: r };
}
