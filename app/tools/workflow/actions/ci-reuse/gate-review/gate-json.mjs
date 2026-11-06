// Shared reading of the JSON gate files for gate-direction.mjs and gate-limits.mjs (US-QG-07). Pure.

export const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The parsed value of a text; throws the reason a reader gives (read it), never a silent default. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("it is not JSON");
  }
}
