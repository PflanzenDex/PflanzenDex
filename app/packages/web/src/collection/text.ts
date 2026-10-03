import type { ApiError } from "../kernel";

/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";

/** `YYYY-MM-DD` as "03.10.2026" (without time zone conversion: it is a calendar date, NFR-08). */
export function dateText(iso: string): string {
  const [jahr, month, tag] = iso.split("-");
  return `${tag}.${month}.${jahr}`;
}

export interface NameConflict {
  name: string;
  existing: { id: string; name: string }[];
}

/** For `specimen.name_taken` the server also supplies the name and the existing specimens of the species. */
export function nameConflict(error: ApiError): NameConflict | null {
  if (error.code !== "specimen.name_taken") return null;
  const data = error.data as unknown as Partial<NameConflict> | undefined;
  return { name: data?.name ?? "", existing: data?.existing ?? [] };
}
