import { LEAF_LIMITS, localToday } from "@pflanzendex/core";
import { z } from "zod";
import { texts } from "@/shared/lib/text-rules/texts";
import { currentTimeZone } from "../../../shared/data";
import table from "../plant-leaves.de.json";
import type { LeafInput } from "../leaves-api";

const t = texts(table);
const WHOLE = /^\d+$/;

/** A size is empty (not measured) or a whole number of millimetres within the limits (US-WAC-07). */
const sizeOk = (text: string): boolean => {
  const value = text.trim();
  if (value === "") return true;
  return (
    WHOLE.test(value) &&
    Number(value) >= LEAF_LIMITS.size.min &&
    Number(value) <= LEAF_LIMITS.size.max
  );
};

/** Input of a leaf in the form: fast feedback per field in German; the server validates again (P-03). */
export const leafSchema = z.object({
  date: z.string(),
  length: z.string().refine(sizeOk, t("error.size")),
  width: z.string().refine(sizeOk, t("error.size")),
  note: z
    .string()
    .refine((text) => [...text.trim()].length <= LEAF_LIMITS.note.max, t("error.note")),
});
export type LeafFields = z.infer<typeof leafSchema>;

export const leafDefaults = (): LeafFields => ({
  date: localToday(new Date(), currentTimeZone()),
  length: "",
  width: "",
  note: "",
});

/** The input to send: empty fields are left out, the fields passed the schema. */
export function toLeafInput(f: LeafFields): LeafInput {
  const note = f.note.trim();
  const length = f.length.trim();
  const width = f.width.trim();
  return {
    date: f.date,
    ...(length ? { lengthMm: Number(length) } : {}),
    ...(width ? { widthMm: Number(width) } : {}),
    ...(note ? { note } : {}),
  };
}
