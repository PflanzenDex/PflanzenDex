import type { ApiError } from "../kernel";
import { MARKER_MISSING, MARKERS_MISSING, type Sibling } from "./marker-fields";

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
 * What the form sends, or the error that keeps it from sending (US-BES-03): from the 2nd specimen on the marker is
 * required, from the 3rd on the markers of the existing specimens that miss one, before anything is saved.
 */
export function collectInput(
  form: {
    marker: string;
    answers: Readonly<Record<string, string>>;
    data: FormData;
    /** The keeper's local today: an unchanged date field sends nothing. */
    today: string;
  },
  rule: { required: boolean; missing: readonly Sibling[] },
): CreateInput | ApiError {
  const marker = form.marker.trim();
  const markers = rule.missing.map((s) => ({
    specimenId: s.id,
    marker: (form.answers[s.id] ?? "").trim(),
  }));
  if (rule.required && !marker) return MARKER_MISSING;
  if (markers.some((m) => !m.marker)) return MARKERS_MISSING;
  const locationId = String(form.data.get("locationId") ?? "");
  const catchDate = String(form.data.get("catchDate") ?? "");
  return {
    ...(marker ? { marker } : {}),
    ...(markers.length > 0 ? { markers } : {}),
    ...(locationId ? { locationId } : {}),
    ...(catchDate && catchDate !== form.today ? { catchDate } : {}),
    ...(form.data.get("cutting") !== null ? { status: "cutting" as const } : {}),
  };
}

export const isError = (r: CreateInput | ApiError): r is ApiError => "code" in r;
