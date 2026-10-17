import { WISH_LIMITS } from "@pflanzendex/core";
import { z } from "zod";
import type { WishInput } from "./wishlist-api";

/** An https address without credentials (the same rule as the server, which decides in the end). */
export function isPlainHttps(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * The form to record a wish (FR-WUN-01, FR-WUN-04, DS-47): fast feedback per field in German. The server operation
 * validates again (P-03). Empty stays unknown instead of guessed (P-08).
 */
export const wishSchema = z
  .object({
    name: z.string().trim().min(WISH_LIMITS.name.min, "Bitte gib einen Namen an."),
    german: z.string(),
    targetZoneId: z.string(),
    difficulty: z.string(),
    reasoning: z.string(),
    imageUrl: z.string().trim(),
    imageSource: z.string().trim(),
  })
  .superRefine((f, ctx) => {
    const issue = (path: "imageUrl" | "imageSource", message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (f.imageUrl !== "" && !isPlainHttps(f.imageUrl))
      issue(
        "imageUrl",
        "Die Bild-Adresse muss mit https:// beginnen und darf keine Zugangsdaten enthalten.",
      );
    if (f.imageUrl !== "" && f.imageSource === "")
      issue("imageSource", "Ein Bild gehört mit seiner Quelle zusammen: Bitte gib die Quelle an.");
    if (f.imageUrl === "" && f.imageSource !== "")
      issue(
        "imageUrl",
        "Eine Quelle gehört zu einem Bild: Bitte gib die Bild-Adresse an oder lösche die Quelle.",
      );
  });

export type WishFields = z.infer<typeof wishSchema>;

export const EMPTY_FIELDS: WishFields = {
  name: "",
  german: "",
  targetZoneId: "",
  difficulty: "",
  reasoning: "",
  imageUrl: "",
  imageSource: "",
};

/** The API input of a checked form: empty fields stay out (unknown, P-08). */
export function toWishInput(f: WishFields): WishInput {
  const german = f.german.trim();
  const reasoning = f.reasoning.trim();
  return {
    name: f.name.trim(),
    ...(german ? { german } : {}),
    ...(f.targetZoneId ? { targetZoneId: f.targetZoneId } : {}),
    ...(f.difficulty ? { difficulty: Number(f.difficulty) } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(f.imageUrl ? { imageUrl: f.imageUrl.trim(), imageSource: f.imageSource.trim() } : {}),
  };
}

/** Fields of the form a server refusal can point at. */
export const REFUSABLE_FIELDS = ["name", "targetZoneId", "imageUrl", "imageSource"] as const;
export type RefusableField = (typeof REFUSABLE_FIELDS)[number];

const CODE_FIELD: Record<string, RefusableField> = {
  "wish.name_taken": "name",
  "light_zone.not_found": "targetZoneId",
};

/**
 * The fields a refusal of the server points at: by error code, or by the field names in its details. Empty when the
 * refusal names no field of the form (then it stays in the alert, P-10).
 */
export function fieldsOfRefusal(error: {
  code: string;
  details?: { field: string }[];
}): RefusableField[] {
  const found = new Set<RefusableField>();
  const byCode = CODE_FIELD[error.code];
  if (byCode) found.add(byCode);
  for (const d of error.details ?? [])
    if ((REFUSABLE_FIELDS as readonly string[]).includes(d.field))
      found.add(d.field as RefusableField);
  return REFUSABLE_FIELDS.filter((f) => found.has(f));
}
