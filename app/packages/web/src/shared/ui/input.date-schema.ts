import { z } from "zod";
import { isCalendarDate } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./input.date-field.de.json";

const t = texts(table);

/** The text of a date that is no real day: the same text as the field's own message, so one message shows (US-QS-32). */
export const NO_DAY_TEXT = t("invalid");

/**
 * What a `DateField` may hand on: `""` (no date) or a real calendar day `YYYY-MM-DD` (NFR-08). A typed text that is no
 * day reaches the form as typed, so this check refuses it.
 */
export const isHandedDate = (value: string): boolean => value === "" || isCalendarDate(value);

/** A date value that may stay empty (an optional field, or a default that is filled in): no real day is refused. */
export const dateValue = () => z.string().refine(isHandedDate, NO_DAY_TEXT);

/** A date the form needs: empty is refused with `missing`, a text that is no real day with the field's message. */
export const requiredDate = (missing: string) =>
  z
    .string()
    .refine((value) => value !== "", missing)
    .refine(isHandedDate, NO_DAY_TEXT);
