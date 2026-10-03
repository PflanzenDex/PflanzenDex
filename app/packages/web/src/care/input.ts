import { MEASUREMENT_LIMITS, QUALITIES, type Quality } from "@pflanzendex/core";
import type { MeasurementInput } from "./measurements-api";

export interface Fields {
  value: string;
  date: string;
  quality: string;
  note: string;
}

export type Reviewed = { ok: true; input: MeasurementInput } | { ok: false; text: string };

const NUMBER = /^\d+[.,]?\d*$/;
const NUMBER_ERROR = "Bitte gib eine Zahl ab 0 an, zum Beispiel 12,5.";

/** Checks the input before sending, so that a typo does not occupy the server first (it checks anyway). */
export function checkInput(f: Fields): Reviewed {
  const text = f.value.trim();
  if (!NUMBER.test(text)) return { ok: false, text: NUMBER_ERROR };
  const value = Number(text.replace(",", "."));
  if (value > MEASUREMENT_LIMITS.value.max) return { ok: false, text: NUMBER_ERROR };
  if (!Number.isInteger(value / MEASUREMENT_LIMITS.step))
    return { ok: false, text: "Miss in Schritten von 0,5 cm, zum Beispiel 12 oder 12,5." };
  const quality = QUALITIES.find((q): q is Quality => q === f.quality);
  if (!quality) return { ok: false, text: "Bitte wähle die Qualität: gesund oder vergeilt/dünn." };
  const note = f.note.trim();
  return {
    ok: true,
    input: {
      value,
      quality,
      ...(f.date ? { date: f.date } : {}),
      ...(note ? { note } : {}),
    },
  };
}
