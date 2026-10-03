import { MESSUNG_GRENZEN, QUALITAETEN, type Qualitaet } from "@pflanzendex/core";
import type { MessungEingabe } from "./messungen-api";

export interface Felder {
  wert: string;
  datum: string;
  qualitaet: string;
  notiz: string;
}

export type Geprueft = { ok: true; eingabe: MessungEingabe } | { ok: false; text: string };

const ZAHL = /^\d+[.,]?\d*$/;
const ZAHL_FEHLER = "Bitte gib eine Zahl ab 0 an, zum Beispiel 12,5.";

/** Prüft die Eingabe vor dem Senden, damit ein Tippfehler nicht erst den Server beschäftigt (er prüft trotzdem). */
export function pruefeEingabe(f: Felder): Geprueft {
  const text = f.wert.trim();
  if (!ZAHL.test(text)) return { ok: false, text: ZAHL_FEHLER };
  const wert = Number(text.replace(",", "."));
  if (wert > MESSUNG_GRENZEN.wert.max) return { ok: false, text: ZAHL_FEHLER };
  if (!Number.isInteger(wert / MESSUNG_GRENZEN.schritt))
    return { ok: false, text: "Miss in Schritten von 0,5 cm, zum Beispiel 12 oder 12,5." };
  const qualitaet = QUALITAETEN.find((q): q is Qualitaet => q === f.qualitaet);
  if (!qualitaet)
    return { ok: false, text: "Bitte wähle die Qualität: gesund oder vergeilt/dünn." };
  const notiz = f.notiz.trim();
  return {
    ok: true,
    eingabe: {
      wert,
      qualitaet,
      ...(f.datum ? { datum: f.datum } : {}),
      ...(notiz ? { notiz } : {}),
    },
  };
}
