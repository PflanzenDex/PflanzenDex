import type {
  LightLocation,
  TreatmentRow,
  MeasurementRow,
  CarePhase,
  NextPhaseChange,
  Quality,
  GrowthMeasure,
} from "@pflanzendex/core";

/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";

export const MASS_NAME: Record<GrowthMeasure, string> = {
  height: "Höhe",
  rosette_diameter: "Rosettendurchmesser",
  shoot_length: "Trieblänge",
};

export const massName = (m: GrowthMeasure | null): string => (m ? MASS_NAME[m] : UNKNOWN);

export const QUALITY_NAME: Record<Quality, string> = {
  healthy: "Gesund",
  etiolated: "Vergeilt/dünn",
};

/** `YYYY-MM-DD` as "03.10.2026" (without time zone conversion: it is a calendar date, NFR-08). */
export function dateText(iso: string): string {
  const [jahr, month, tag] = iso.split("-");
  return `${tag}.${month}.${jahr}`;
}

/** "12.5 cm": the measures of the species are measured in centimeters (US-WAC-01). */
export const valueText = (value: number): string =>
  `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;

export const measurementText = (m: MeasurementRow): string =>
  `${valueText(m.value)} am ${dateText(m.date)}`;

export const PHASE_TEXT: Record<CarePhase, string> = {
  dormancy: "Ruhephase",
  growth: "Wachstumsphase",
};

/** Up to this many days ahead the forecast names the distance in days (US-PHA-04). */
const NEAR_DAYS = 14;

/** "heute", "in 5 Tagen (10.10.2026)" up to 14 days ahead, otherwise only the date (US-PHA-04). */
export function changeWhenText(change: NextPhaseChange): string {
  if (change.days === 0) return "heute";
  const date = dateText(change.date);
  if (change.days > NEAR_DAYS) return date;
  return `in ${change.days} ${change.days === 1 ? "Tag" : "Tagen"} (${date})`;
}

/** "Nächster Wechsel zur Ruhephase: heute"; without a change in this and the next year it says so (P-08). */
export const nextChangeText = (change: NextPhaseChange | null): string =>
  change === null
    ? "Nächster Phasenwechsel: keiner in diesem und im nächsten Jahr."
    : `Nächster Wechsel zur ${PHASE_TEXT[change.phase]}: ${changeWhenText(change)}`;

export const locationText = (locations: readonly LightLocation[], id: string | null): string =>
  id === null ? UNKNOWN : (locations.find((s) => s.id === id)?.name ?? UNKNOWN);

/** "3 Termine für 1 Exemplar geplant." and where to see them (P-09). */
export function treatmentsPlannedText(rows: readonly TreatmentRow[]): string {
  const specimens = new Set(rows.map((r) => r.specimenId)).size;
  const dates = rows.length === 1 ? "1 Termin" : `${rows.length} Termine`;
  const forWhom = specimens === 1 ? "1 Exemplar" : `${specimens} Exemplare`;
  return `${dates} für ${forWhom} geplant. Den nächsten Termin siehst du auf der Karte im Bestand.`;
}
