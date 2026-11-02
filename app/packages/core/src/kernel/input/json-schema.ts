// JSON Schema of the input checks (US-KI-07): a client that builds input (the MCP tools of the AI interface) learns every
// field, its type and its limits from the same check that validates it, so the description cannot drift from the rule.
// The schema only describes; the check stays the one that decides (P-03).

export type JsonSchema = Readonly<Record<string, unknown>>;

const SCHEMAS = new WeakMap<object, () => JsonSchema>();

/** Attaches the JSON Schema to a check and returns the check unchanged. */
export function described<F extends object>(check: F, json: JsonSchema | (() => JsonSchema)): F {
  SCHEMAS.set(check, typeof json === "function" ? json : () => json);
  return check;
}

/** The JSON Schema of a check, or null when the check carries none. */
export const jsonSchemaOf = (check: object): JsonSchema | null => SCHEMAS.get(check)?.() ?? null;

/** The schema that also allows `null` (the field may be missing). */
export function nullable(json: JsonSchema): JsonSchema {
  const types = ([] as unknown[]).concat(json["type"] ?? []);
  const withNull = types.includes("null") ? types : [...types, "null"];
  const choices = json["enum"];
  return {
    ...json,
    type: withNull,
    ...(Array.isArray(choices) && !choices.includes(null) ? { enum: [...choices, null] } : {}),
  };
}
