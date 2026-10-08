import type { CreateFields } from "../model/schemas";

export interface CreateInput {
  marker?: string;
  /** Markers for existing specimens that have none yet, from the 3rd specimen on (US-BES-03). */
  markers?: { specimenId: string; marker: string }[];
  locationId?: string;
  /** Only "cutting" is sent; without a value the specimen is a plant (US-BES-04). */
  status?: "cutting";
  /** Back-dated catch date `YYYY-MM-DD`; omitted means today's local date (FR-BES-04). */
  catchDate?: string;
}

/**
 * What the checked form sends (US-BES-03): empty fields stay out (unknown, P-08), an unchanged catch date sends
 * nothing, so the server uses the keeper's local today.
 */
export function toCreateInput(
  f: CreateFields,
  missing: readonly { id: string }[],
  today: string,
): CreateInput {
  const marker = f.marker.trim();
  const markers = missing.map((s) => ({
    specimenId: s.id,
    marker: (f.answers[s.id] ?? "").trim(),
  }));
  return {
    ...(marker ? { marker } : {}),
    ...(markers.length > 0 ? { markers } : {}),
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.catchDate && f.catchDate !== today ? { catchDate: f.catchDate } : {}),
    ...(f.cutting ? { status: "cutting" as const } : {}),
  };
}
