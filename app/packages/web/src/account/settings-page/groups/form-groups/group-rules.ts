import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Path } from "react-hook-form";
import {
  DISPLAY_NAME_LIMITS,
  POSITION_THRESHOLD_LIMITS as THRESHOLDS,
  REPLENISH_BUFFER_LIMITS as BUFFER,
} from "@pflanzendex/core";
import type { ApiError } from "../../../../shared/data";
import { formatLux, profileSchema, type ProfileFields as Fields } from "../../../schemas";
import table from "./form-groups.de.json";

const t = texts(table);

/**
 * The profile schema of one group's form (F-0085, US-QS-32). A stored name cannot be cleared (the server keeps it, so
 * a refusal would only come back), hence an emptied name is an error when it is left or sent; before a name is stored
 * an empty name is the "none" the account starts with, which is valid.
 */
export function groupSchema(storedName: string | null) {
  if (storedName === null) return profileSchema;
  return profileSchema.superRefine((f, ctx) => {
    if (f.displayName.trim() === "")
      ctx.addIssue({ code: "custom", path: ["displayName"], message: t("displayName.empty") });
  });
}

/**
 * The text of a field the server refuses (F-0092, SG-FORM-05, WCAG 3.3.3): how to fix that field, from the rule of the
 * field, instead of the generic line of the code. A field without a rule of its own keeps the text of the code.
 */
export function fixText(field: Path<Fields>, error: ApiError): string {
  const key = field.split(".")[0];
  if (key === "displayName") return t("displayName.refused", { max: DISPLAY_NAME_LIMITS.max });
  if (key === "timeZone") return t("timeZone.refused");
  if (key === "replenishBuffer")
    return t("replenishBuffer.refused", { min: BUFFER.min, max: BUFFER.max });
  if (key === "positionThresholds")
    return t("positionThresholds.refused", {
      min: formatLux(THRESHOLDS.min),
      max: formatLux(THRESHOLDS.max),
    });
  return refusalText(error);
}
