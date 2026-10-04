import { WISH_LIMITS } from "@pflanzendex/core";
import type { WishInput } from "./wishlist-api";

export interface WishFields {
  name: string;
  german: string;
  targetZoneId: string;
  difficulty: string;
  reasoning: string;
  imageUrl: string;
  imageSource: string;
}

export const EMPTY_FIELDS: WishFields = {
  name: "",
  german: "",
  targetZoneId: "",
  difficulty: "",
  reasoning: "",
  imageUrl: "",
  imageSource: "",
};

/** Fields in the order of the form; the first invalid one takes the focus. */
export const FIELD_ORDER = ["name", "targetZoneId", "imageUrl", "imageSource"] as const;
export type ErrorField = (typeof FIELD_ORDER)[number];
export type FieldErrors = Partial<Record<ErrorField, string>>;

/** An https address without credentials (the same rule as the server, which decides in the end). */
function isPlainHttps(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/** Turns the form into the input of the API, or says in German per field what is wrong (FR-WUN-01, FR-WUN-04). Empty stays unknown (P-08). */
export function checkWish(f: WishFields): { input: WishInput } | { errors: FieldErrors } {
  const name = f.name.trim();
  const imageUrl = f.imageUrl.trim();
  const imageSource = f.imageSource.trim();
  const errors: FieldErrors = {};
  if (name.length < WISH_LIMITS.name.min) errors.name = "Bitte gib einen Namen an.";
  if (imageUrl !== "" && !isPlainHttps(imageUrl))
    errors.imageUrl =
      "Die Bild-Adresse muss mit https:// beginnen und darf keine Zugangsdaten enthalten.";
  if (imageUrl !== "" && imageSource === "")
    errors.imageSource = "Ein Bild gehört mit seiner Quelle zusammen: Bitte gib die Quelle an.";
  if (imageUrl === "" && imageSource !== "")
    errors.imageUrl =
      "Eine Quelle gehört zu einem Bild: Bitte gib die Bild-Adresse an oder lösche die Quelle.";
  if (Object.keys(errors).length > 0) return { errors };
  const german = f.german.trim();
  const reasoning = f.reasoning.trim();
  return {
    input: {
      name,
      ...(german ? { german } : {}),
      ...(f.targetZoneId ? { targetZoneId: f.targetZoneId } : {}),
      ...(f.difficulty ? { difficulty: Number(f.difficulty) } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(imageUrl ? { imageUrl, imageSource } : {}),
    },
  };
}

const CODE_FIELD: Record<string, ErrorField> = {
  "wish.name_taken": "name",
  "light_zone.not_found": "targetZoneId",
};

/**
 * The fields a refusal of the server points at: by error code, or by the field names in its details. Empty when the
 * refusal names no field of the form (then it stays in the alert, P-10).
 */
export function fieldsOfRefusal(error: {
  code: string;
  text: string;
  details?: { field: string }[];
}): FieldErrors {
  const errors: FieldErrors = {};
  const byCode = CODE_FIELD[error.code];
  if (byCode) errors[byCode] = error.text;
  for (const d of error.details ?? [])
    if ((FIELD_ORDER as readonly string[]).includes(d.field))
      errors[d.field as ErrorField] = error.text;
  return errors;
}
