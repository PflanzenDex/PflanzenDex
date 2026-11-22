import { texts } from "@/shared/lib/text-rules/texts";
import { isKeyConflict, savedResult, type Response } from "../api";
import table from "./write-action.de.json";

const t = texts(table);

/**
 * How a write says its saved result to the keeper (US-QS-03): the thing that is saved, e.g. "12 cm am 22.11.2026" or the
 * plant's name. The key conflict sentence names it ("Gesichert ist: {saved}. …").
 */
export type DescribeSaved = (saved: unknown) => string;

/**
 * A key conflict names what is saved when the write describes its saved result (US-QS-03): the refusal carries the German
 * sentence in `conflictText`. An answer of any other kind, or a write without a description, stays as it is.
 */
export const describeConflict = <T, D>(
  r: Response<T, D>,
  describeSaved?: DescribeSaved,
): Response<T, D> => {
  if (r.ok || !isKeyConflict(r.error) || !describeSaved) return r;
  const saved = savedResult(r.error);
  if (saved === undefined || saved === null) return r;
  const described = describeSaved(saved);
  if (described === "") return r;
  return {
    ok: false,
    error: { ...r.error, conflictText: t("keyConflictSaved", { saved: described }) },
  };
};
