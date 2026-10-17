import {
  calendarDateField,
  choiceField,
  idField,
  numberField,
  orNull,
  shape,
  textField,
  type ErrorDetail,
} from "../../kernel";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES } from "../store/types";

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

/** A price in euro with at most two decimals (assumption: no fractions of a cent). */
export function priceField(field: string) {
  const number = numberField(field, EQUIPMENT_LIMITS.priceEur);
  return (value: unknown): number | ErrorDetail => {
    const checked = number(value);
    if (typeof checked !== "number") return checked;
    return Math.abs(checked * 100 - Math.round(checked * 100)) < 1e-6
      ? Math.round(checked * 100) / 100
      : { field, code: "input.invalid" };
  };
}

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
});
