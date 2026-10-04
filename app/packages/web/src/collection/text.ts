import type { ApiError } from "../kernel";

/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";

/** `YYYY-MM-DD` as "03.10.2026" (without time zone conversion: it is a calendar date, NFR-08). */
export function dateText(iso: string): string {
  const [jahr, month, tag] = iso.split("-");
  return `${tag}.${month}.${jahr}`;
}

/** "12,5 cm": the growth measures of the species are measured in centimetres (US-WAC-01). */
export const valueText = (value: number): string =>
  `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;

export interface NameConflict {
  name: string;
  existing: { id: string; name: string }[];
}

/**
 * For `specimen.name_taken` and `specimen.marker_required` the server also supplies the name and the existing
 * specimens of the species.
 */
export function nameConflict(error: ApiError): NameConflict | null {
  if (error.code !== "specimen.name_taken" && error.code !== "specimen.marker_required")
    return null;
  const data = error.data as unknown as Partial<NameConflict> | undefined;
  return { name: data?.name ?? "", existing: data?.existing ?? [] };
}
