import { texts } from "@/shared/lib/text-rules/texts";
import { isKeyConflict, type ApiError } from "../api";
import table from "./write-action.de.json";

const t = texts(table);

/**
 * A key conflict names what is saved (US-QS-03). `describeSaved` turns the saved result of the write into its words, e.g.
 * "12 cm am 22.11.2026" or the plant's name; the sentence "Gesichert ist: …" is set on `conflictText`. Called by the screens
 * whose write describes its result, so the shared write layer carries no description.
 */
export function describeConflict(
  error: ApiError,
  describeSaved: (saved: unknown) => string,
): ApiError {
  if (!isKeyConflict(error)) return error;
  const data: unknown = error.data;
  if (data === null || typeof data !== "object" || !("saved" in data)) return error;
  if (data.saved === null || data.saved === undefined) return error;
  const described = describeSaved(data.saved);
  if (described === "") return error;
  return { ...error, conflictText: t("keyConflictSaved", { saved: described }) };
}
