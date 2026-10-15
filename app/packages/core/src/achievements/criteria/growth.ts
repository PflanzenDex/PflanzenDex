// Criteria of the group "growth" (US-ACH-01). Etiolated growth never counts as success (US-WAC-04, FR-ACH-05).
import { ACHIEVEMENT_LIMITS } from "../types";
import type { Criterion, Earned, MeasurementFact } from "../types";

/** Chronological order; equal dates keep the order of the input (the one recorded last comes last). */
const byDate = (list: readonly MeasurementFact[]): MeasurementFact[] =>
  list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.date < b.m.date ? -1 : a.m.date > b.m.date ? 1 : a.i - b.i))
    .map((x) => x.m);

/** The same calendar day one year later; 29 February maps to 28 February (NFR-08). */
const oneYearLater = (date: string): string => {
  const md = date.slice(5);
  return `${Number(date.slice(0, 4)) + 1}-${md === "02-29" ? "02-28" : md}`;
};

/** First measurement with photo: the earliest measurement that has a photo (US-WAC-01, US-WAC-05). */
export const firstMeasurementPhoto: Criterion = (facts) => {
  const withPhoto = byDate(facts.measurements.filter((m) => m.hasPhoto))[0];
  if (withPhoto) {
    return { earned: { earnedOn: withPhoto.date, specimenId: withPhoto.specimenId } };
  }
  return {
    open: {
      missing: facts.measurements.length === 0 ? "no_measurements" : "no_photo",
      specimenId: null,
    },
  };
};

/**
 * Healthy for a year: a specimen whose last 4 measurements are all `Healthy` and span at least 12 months (both numbers
 * are assumptions, US-ACH-01). Earned on the date of the measurement that completed the first such window; an
 * etiolated measurement inside the window breaks it, so thin growth never counts.
 */
export const healthyForAYear: Criterion = (facts) => {
  const need = ACHIEVEMENT_LIMITS.healthyMeasurements;
  const found: Earned[] = [];
  let enough = false;
  for (const s of facts.specimens) {
    const list = byDate(facts.measurements.filter((m) => m.specimenId === s.id));
    if (list.length >= need) enough = true;
    for (let i = need - 1; i < list.length; i++) {
      const window = list.slice(i - need + 1, i + 1);
      const last = window[need - 1] as MeasurementFact;
      const first = window[0] as MeasurementFact;
      if (window.every((m) => m.quality === "healthy") && oneYearLater(first.date) <= last.date) {
        found.push({ earnedOn: last.date, specimenId: s.id });
        break;
      }
    }
  }
  const first = found.reduce<Earned | null>(
    (a, e) => (a === null || e.earnedOn < a.earnedOn ? e : a),
    null,
  );
  if (first) return { earned: first };
  if (facts.measurements.length === 0)
    return { open: { missing: "no_measurements", specimenId: null } };
  return { open: { missing: enough ? null : "too_few_measurements", specimenId: null } };
};
