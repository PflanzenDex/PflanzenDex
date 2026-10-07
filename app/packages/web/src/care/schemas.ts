import {
  COURSE_DEFAULTS,
  MEASUREMENT_LIMITS,
  QUALITIES,
  TREATMENT_LIMITS,
} from "@pflanzendex/core";
import { z } from "zod";
import type { MeasurementInput } from "./measurements-api";
import type { TreatmentInput } from "./api/treatments-api";

/**
 * The form to record a measurement (US-WAC-01, DS-47): fast feedback per field in German, so a typo does not occupy
 * the server first. The server operation validates again (P-03). The date stays a `YYYY-MM-DD` string; an empty one
 * means today on the server.
 */
const NUMBER = /^\d+[.,]?\d*$/;
const NUMBER_ERROR = "Bitte gib eine Zahl ab 0 an, zum Beispiel 12,5.";
const STEP_ERROR = "Miss in Schritten von 0,5 cm, zum Beispiel 12 oder 12,5.";

export const measurementSchema = z.object({
  value: z.string().superRefine((text, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const t = text.trim();
    if (!NUMBER.test(t)) return issue(NUMBER_ERROR);
    const value = Number(t.replace(",", "."));
    if (value > MEASUREMENT_LIMITS.value.max) return issue(NUMBER_ERROR);
    if (!Number.isInteger(value / MEASUREMENT_LIMITS.step)) issue(STEP_ERROR);
  }),
  date: z.string(),
  quality: z.enum(QUALITIES, { error: "Bitte wähle die Qualität: gesund oder vergeilt/dünn." }),
  note: z.string(),
});
export type MeasurementFields = z.infer<typeof measurementSchema>;

/** The input to send; the fields passed the schema, so the number is valid. */
export function toMeasurementInput(f: MeasurementFields): MeasurementInput {
  const note = f.note.trim();
  return {
    value: Number(f.value.trim().replace(",", ".")),
    quality: f.quality,
    ...(f.date ? { date: f.date } : {}),
    ...(note ? { note } : {}),
  };
}

export const measurementDefaults = (today: string): MeasurementFields => ({
  value: "",
  date: today,
  quality: "healthy",
  note: "",
});

const whole = (text: string, limits: { min: number; max: number }): number | null => {
  const n = Number(text);
  return /^\d+$/.test(text.trim()) && n >= limits.min && n <= limits.max ? n : null;
};

const COUNT = TREATMENT_LIMITS.courseCount;
const INTERVAL = TREATMENT_LIMITS.courseInterval;

/**
 * The form "Behandlung planen" (US-BEH-01, DS-47): one or several specimens, a reason, an optional agent, the first
 * date and, for a course, N dates at T days. Count and interval only count when "Kur planen" is on.
 */
export const treatmentSchema = z
  .object({
    specimenIds: z.array(z.string()).min(1, "Wähle mindestens ein Exemplar, das behandelt wird."),
    reason: z.string().trim().min(1, "Bitte nenne einen Grund, zum Beispiel Wollläuse."),
    agent: z.string(),
    date: z.string().min(1, "Bitte wähle ein Datum für den ersten Termin."),
    isCourse: z.boolean(),
    count: z.string(),
    intervalDays: z.string(),
  })
  .superRefine((f, ctx) => {
    if (!f.isCourse) return;
    if (whole(f.count, COUNT) === null)
      ctx.addIssue({
        code: "custom",
        path: ["count"],
        message: `Die Anzahl der Termine ist eine ganze Zahl von ${COUNT.min} bis ${COUNT.max}.`,
      });
    if (whole(f.intervalDays, INTERVAL) === null)
      ctx.addIssue({
        code: "custom",
        path: ["intervalDays"],
        message: `Der Abstand ist eine ganze Zahl von ${INTERVAL.min} bis ${INTERVAL.max} Tagen.`,
      });
  });
export type TreatmentFields = z.infer<typeof treatmentSchema>;

export const treatmentDefaults = (today: string): TreatmentFields => ({
  specimenIds: [],
  reason: "",
  agent: "",
  date: today,
  isCourse: false,
  count: String(COURSE_DEFAULTS.count),
  intervalDays: String(COURSE_DEFAULTS.intervalDays),
});

/** The input to send; the fields passed the schema, so count and interval are valid when it is a course. */
export function toTreatmentInput(f: TreatmentFields): TreatmentInput {
  const agent = f.agent.trim();
  const base = {
    specimenIds: f.specimenIds,
    reason: f.reason.trim(),
    date: f.date,
    ...(agent ? { agent } : {}),
  };
  if (!f.isCourse) return base;
  return {
    ...base,
    course: { count: Number(f.count), intervalDays: Number(f.intervalDays) },
  };
}
