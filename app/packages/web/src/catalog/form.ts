import type { Species } from "@pflanzendex/core";
import type { ApiError } from "../kernel";

const ZAHLEN = ["difficulty", "standardLevel", "lightDemandLux"];

/** Form values as API input: empty ones are dropped (means "unknown"), numbers are numbers, synonyms one per line. */
export function formToInput(f: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, raw] of f.entries()) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") continue;
    if (name === "synonyms") {
      input[name] = text
        .split(/\n/)
        .map((z) => z.trim())
        .filter(Boolean);
    } else input[name] = ZAHLEN.includes(name) ? Number(text) : text;
  }
  return input;
}

/** For `species.duplicate` the server also supplies the existing species. */
export function duplicate(error: ApiError): Species | null {
  if (error.code !== "species.duplicate") return null;
  const data = error.data as unknown as { existing?: Species } | undefined;
  return data?.existing ?? null;
}
