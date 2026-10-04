import { COURSE_DEFAULTS, TREATMENT_LIMITS } from "@pflanzendex/core";
import type { TreatmentInput } from "./treatments-api";

export interface TreatmentFields {
  specimenIds: readonly string[];
  reason: string;
  agent: string;
  date: string;
  isCourse: boolean;
  count: string;
  intervalDays: string;
}

export type Reviewed = { ok: true; input: TreatmentInput } | { ok: false; text: string };

export const COURSE_START = {
  count: String(COURSE_DEFAULTS.count),
  intervalDays: String(COURSE_DEFAULTS.intervalDays),
};

const whole = (text: string, limits: { min: number; max: number }): number | null => {
  const n = Number(text);
  return /^\d+$/.test(text.trim()) && n >= limits.min && n <= limits.max ? n : null;
};

/** Checks the input before sending, so that a typo does not occupy the server first (it checks anyway). */
export function checkTreatment(f: TreatmentFields): Reviewed {
  if (f.specimenIds.length === 0)
    return { ok: false, text: "Wähle mindestens ein Exemplar, das behandelt wird." };
  const reason = f.reason.trim();
  if (!reason) return { ok: false, text: "Bitte nenne einen Grund, zum Beispiel Wollläuse." };
  if (!f.date) return { ok: false, text: "Bitte wähle ein Datum für den ersten Termin." };
  const agent = f.agent.trim();
  const base = { specimenIds: f.specimenIds, reason, date: f.date, ...(agent ? { agent } : {}) };
  if (!f.isCourse) return { ok: true, input: base };
  const count = whole(f.count, TREATMENT_LIMITS.courseCount);
  const intervalDays = whole(f.intervalDays, TREATMENT_LIMITS.courseInterval);
  if (count === null)
    return {
      ok: false,
      text: `Die Anzahl der Termine ist eine ganze Zahl von ${TREATMENT_LIMITS.courseCount.min} bis ${TREATMENT_LIMITS.courseCount.max}.`,
    };
  if (intervalDays === null)
    return {
      ok: false,
      text: `Der Abstand ist eine ganze Zahl von ${TREATMENT_LIMITS.courseInterval.min} bis ${TREATMENT_LIMITS.courseInterval.max} Tagen.`,
    };
  return { ok: true, input: { ...base, course: { count, intervalDays } } };
}
