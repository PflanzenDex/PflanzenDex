import {
  calendarDateField,
  choiceField,
  described,
  idField,
  numberField,
  orNull,
  shape,
  textField,
  type ErrorDetail,
} from "../../kernel";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES, POT_LIMITS } from "../store/types";

/** The product id says what the product is, never where to buy it: no URL (FR-EQU-03). */
export function productIdField(field: string) {
  const text = textField(field, EQUIPMENT_LIMITS.productId);
  return (value: unknown): string | ErrorDetail => {
    const checked = text(value);
    if (typeof checked !== "string") return checked;
    return checked.includes("://") || checked.toLowerCase().startsWith("www.")
      ? { field, code: "input.invalid" }
      : checked;
  };
}

/** Steps of a decimal value: a price in cents and a length in tenths of a centimeter, as the database keeps them. */
const CENTS = 100;
const TENTHS_OF_CM = 10;
/** Tolerance of the floating-point check that a value sits on a step. */
const STEP_TOLERANCE = 1e-6;

/** A price in euro with at most two decimals (assumption: no fractions of a cent). */
export function priceField(field: string) {
  const number = numberField(field, EQUIPMENT_LIMITS.priceEur);
  return (value: unknown): number | ErrorDetail => {
    const checked = number(value);
    if (typeof checked !== "number") return checked;
    return Math.abs(checked * CENTS - Math.round(checked * CENTS)) < STEP_TOLERANCE
      ? Math.round(checked * CENTS) / CENTS
      : { field, code: "input.invalid" };
  };
}

/** A length of a pot in centimeters with at most one decimal, as the database column keeps it (US-BES-19, DM-EQU-05). */
export function sizeCmField(field: string) {
  const number = numberField(field, POT_LIMITS.sizeCm);
  return (value: unknown): number | ErrorDetail => {
    const checked = number(value);
    if (typeof checked !== "number") return checked;
    return Math.abs(checked * TENTHS_OF_CM - Math.round(checked * TENTHS_OF_CM)) < STEP_TOLERANCE
      ? Math.round(checked * TENTHS_OF_CM) / TENTHS_OF_CM
      : { field, code: "input.invalid" };
  };
}

/** Yes or no (DM-EQU-05, drainage of a pot). */
export const booleanField = (field: string) =>
  described(
    (value: unknown): boolean | ErrorDetail =>
      typeof value === "boolean" ? value : { field, code: "input.invalid" },
    { type: "boolean" },
  );

export const recordSchema = shape({
  type: choiceField("type", EQUIPMENT_TYPES),
  name: textField("name", EQUIPMENT_LIMITS.name),
  manufacturer: orNull(textField("manufacturer", EQUIPMENT_LIMITS.manufacturer)),
  model: orNull(textField("model", EQUIPMENT_LIMITS.model)),
  productId: orNull(productIdField("productId")),
  priceEur: orNull(priceField("priceEur")),
  boughtAt: orNull(calendarDateField("boughtAt")),
  note: orNull(textField("note", EQUIPMENT_LIMITS.note)),
  lightZoneId: orNull(idField("lightZoneId")),
  diameterCm: orNull(sizeCmField("diameterCm")),
  heightCm: orNull(sizeCmField("heightCm")),
  material: orNull(textField("material", POT_LIMITS.material)),
  drainage: orNull(booleanField("drainage")),
});
