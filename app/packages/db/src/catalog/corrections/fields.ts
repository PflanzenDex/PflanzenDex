import type { CorrectionField } from "@pflanzendex/core";

// Column names and timestamp format shared by the correction queries (US-BES-14 to US-BES-16).
export const COLUMN: Record<CorrectionField, string> = {
  familyLatin: "family_latin",
  germanName: "german_name",
  botanicalStory: "botanical_story",
};
export const FIELD = Object.fromEntries(Object.entries(COLUMN).map(([k, v]) => [v, k])) as Record<
  string,
  CorrectionField
>;
export const ISO = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
