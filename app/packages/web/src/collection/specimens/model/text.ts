import type { ApiError } from "../../../kernel";

export { UNKNOWN, dateText, valueText } from "@/lib/format";

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
