// Building blocks of the MCP tools (E-04): the tool's shape, small JSON Schema helpers, the request of a route and the
// structural check of the arguments. Meaning and limits of the input stay with the operation behind the route (P-03).
export type Json = Readonly<Record<string, unknown>>;

/** The request a tool sends to its route of the AI interface. */
export interface RouteRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export interface McpTool {
  readonly name: string;
  readonly title: string;
  /** For the model: what the tool does and when to use it (English, short). */
  readonly description: string;
  /** Key in AI_OPERATION_CLASSES: the one place that decides the right of the tool (FR-KI-12). */
  readonly operation: string;
  readonly inputSchema: Json;
  readonly readOnly: boolean;
  /** Only offered when the app has the port behind the route (the image check needs the Commons source client). */
  readonly needsSources?: true;
  readonly request: (args: Json) => RouteRequest;
}

export const str = (description: string, extra: Json = {}) => ({
  type: "string",
  description,
  ...extra,
});
export const object = (properties: Json, required: readonly string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
export const TIME_ZONE = str(
  "IANA time zone of the keeper, e.g. Europe/Berlin (decides what 'today' is).",
  {
    minLength: 1,
    maxLength: 64,
  },
);
export const ID = (what: string) => str(`Id of the ${what} (UUID).`, { format: "uuid" });

export const query = (path: string, args: Json, keys: readonly string[]) => {
  const q = new URLSearchParams();
  for (const k of keys) if (args[k] !== undefined) q.set(k, String(args[k]));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
};
export const seg = (v: unknown) => encodeURIComponent(String(v));
export const keyOf = (args: Json) =>
  typeof args["idempotencyKey"] === "string" ? { idempotencyKey: args["idempotencyKey"] } : {};
export const IDEMPOTENCY = str(
  "Optional key that makes a repeated call count once; reuse it when you retry the same call.",
  { minLength: 1, maxLength: 200 },
);

type Check = { readonly field: string; readonly problem: string };

function checkValue(field: string, schema: Json, value: unknown): Check | null {
  const types = ([] as unknown[]).concat(schema["type"]);
  const kind = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : Number.isInteger(value)
        ? "integer"
        : typeof value;
  const fits = types.includes(kind);
  if (!fits) return { field, problem: `must be ${types.join(" or ")}` };
  if (Array.isArray(schema["enum"]) && !schema["enum"].includes(value))
    return { field, problem: `must be one of ${schema["enum"].join(", ")}` };
  return null;
}

/**
 * The structural check of the arguments against the tool's schema: required fields, no unknown fields, the JSON types.
 * Lengths, formats and meaning stay with the operation behind the route (P-03), which answers with its own error code.
 */
export function checkArguments(tool: McpTool, args: Json): readonly Check[] {
  const props = tool.inputSchema["properties"] as Readonly<Record<string, Json>>;
  const required = (tool.inputSchema["required"] as readonly string[] | undefined) ?? [];
  const problems: Check[] = required
    .filter((k) => args[k] === undefined)
    .map((field) => ({ field, problem: "is required" }));
  for (const [field, value] of Object.entries(args)) {
    const schema = props[field];
    const p = schema
      ? checkValue(field, schema, value)
      : { field, problem: "is not a known argument" };
    if (p) problems.push(p);
  }
  return problems;
}
