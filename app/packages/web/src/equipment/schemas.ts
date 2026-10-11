import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES } from "@pflanzendex/core";
import { z } from "zod";
import type { EquipmentInput } from "./equipment-api";

const NOT_URL = "Die Produkt-ID sagt, was das Produkt ist, und ist keine Adresse: Bitte keine URL.";

/** A price with a decimal comma or point and at most two decimals; empty is unknown. */
const isPrice = (v: string): boolean => {
  const [whole = "", cents, ...rest] = v.split(/[.,]/);
  return (
    rest.length === 0 &&
    whole.length >= 1 &&
    whole.length <= 6 &&
    [...whole].every((c) => c >= "0" && c <= "9") &&
    (cents === undefined ||
      (cents.length >= 1 && cents.length <= 2 && [...cents].every((c) => c >= "0" && c <= "9")))
  );
};

/**
 * The form to record equipment (US-EQU-01): fast feedback per field in German. The server operation validates again
 * (P-03). Empty stays unknown instead of guessed (P-08).
 */
export const equipmentSchema = z
  .object({
    type: z.enum(EQUIPMENT_TYPES, { error: "Bitte wähle eine Art." }),
    name: z.string().trim().min(EQUIPMENT_LIMITS.name.min, "Bitte gib einen Namen an."),
    manufacturer: z.string(),
    model: z.string(),
    productId: z
      .string()
      .trim()
      .refine((v) => !v.includes("://") && !v.toLowerCase().startsWith("www."), NOT_URL),
    priceEur: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || isPrice(v),
        "Bitte gib einen Preis in Euro an, zum Beispiel 49,90.",
      ),
    boughtAt: z.string(),
    note: z.string(),
    lightZoneId: z.string(),
  })
  .superRefine((f, ctx) => {
    if (f.type === "Lamp" && f.lightZoneId === "")
      ctx.addIssue({
        code: "custom",
        path: ["lightZoneId"],
        message: "Bitte wähle die Lichtzone, in der die Lampe hängt.",
      });
  });

export type EquipmentFields = z.input<typeof equipmentSchema>;

export const EMPTY_FIELDS: EquipmentFields = {
  type: "" as EquipmentFields["type"],
  name: "",
  manufacturer: "",
  model: "",
  productId: "",
  priceEur: "",
  boughtAt: "",
  note: "",
  lightZoneId: "",
};

/** The API input of a checked form: empty fields stay out (unknown, P-08). */
export function toEquipmentInput(f: EquipmentFields): EquipmentInput {
  const text = (v: string) => v.trim();
  const optional = (key: "manufacturer" | "model" | "productId" | "note") =>
    text(f[key]) ? { [key]: text(f[key]) } : {};
  return {
    type: f.type,
    name: text(f.name),
    ...optional("manufacturer"),
    ...optional("model"),
    ...optional("productId"),
    ...optional("note"),
    ...(f.priceEur.trim() ? { priceEur: Number(f.priceEur.trim().replace(",", ".")) } : {}),
    ...(f.boughtAt ? { boughtAt: f.boughtAt } : {}),
    ...(f.type === "Lamp" && f.lightZoneId ? { lightZoneId: f.lightZoneId } : {}),
  };
}

/** Fields of the form a server refusal can point at. */
const REFUSABLE = ["type", "name", "productId", "priceEur", "boughtAt", "lightZoneId"] as const;
export type RefusableField = (typeof REFUSABLE)[number];

export function fieldsOfRefusal(error: {
  code: string;
  details?: { field: string }[];
}): RefusableField[] {
  const found = new Set<string>();
  if (error.code === "equipment.name_taken") found.add("name");
  if (error.code === "light_zone.not_found") found.add("lightZoneId");
  for (const d of error.details ?? []) found.add(d.field);
  return REFUSABLE.filter((f) => found.has(f));
}
