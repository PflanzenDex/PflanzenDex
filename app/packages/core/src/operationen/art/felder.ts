import { fehlgeschlagen, type Ergebnis } from "../ergebnis";
import { fehler, type Fehlerdetail } from "../fehler";
import { ganzzahlFeld } from "../licht/felder";
import { GRENZEN as LICHT } from "../licht/typen";
import { objekt, textFeld, wahlFeld } from "../validierung";
import { parseLateinisch, type LateinischerName } from "./name";
import { ART_GRENZEN, WACHSTUMSMASSE } from "./typen";

const ungueltig = (feld: string): Fehlerdetail => ({ feld, code: "eingabe.ungueltig" });
const leer = (wert: unknown) =>
  wert === undefined || wert === null || (typeof wert === "string" && wert.trim() === "");

/** Freitext, der fehlen darf: leer heißt „unbekannt“ (null), nie ein erfundener Wert (P-08). */
const optional = (feld: string, max: number) => {
  const pruefe = textFeld(feld, { min: 1, max });
  return (wert: unknown): string | Fehlerdetail | null => (leer(wert) ? null : pruefe(wert));
};

const lateinischFeld = (wert: unknown): LateinischerName | Fehlerdetail =>
  (typeof wert === "string" && parseLateinisch(wert)) || ungueltig("lateinischerName");

const synonymFeld = (wert: unknown): string[] | Fehlerdetail => {
  if (leer(wert)) return [];
  const pruefe = textFeld("synonyme", ART_GRENZEN.name);
  if (!Array.isArray(wert) || wert.length > ART_GRENZEN.synonyme) return ungueltig("synonyme");
  const texte = wert.map(pruefe);
  const text = (t: string | Fehlerdetail): t is string => typeof t === "string";
  return texte.every(text) ? [...new Set(texte)] : ungueltig("synonyme");
};

const TAGE = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** `MM-TT` (Monat-Tag, ohne Jahr); der 29. Februar ist erlaubt. */
const gueltigerTag = (monat: number, tag: number) =>
  monat >= 1 && monat <= 12 && tag >= 1 && tag <= (TAGE[monat - 1] ?? 0);

export const monatTag = (feld: string) => (wert: unknown) => {
  if (leer(wert)) return null;
  const m = typeof wert === "string" ? /^(\d\d)-(\d\d)$/.exec(wert) : null;
  return m && gueltigerTag(Number(m[1]), Number(m[2])) ? m[0] : ungueltig(feld);
};

const basis = objekt({
  lateinischerName: lateinischFeld,
  deutscherName: optional("deutscherName", ART_GRENZEN.name.max),
  englischerName: optional("englischerName", ART_GRENZEN.name.max),
  synonyme: synonymFeld,
  familieDeutsch: optional("familieDeutsch", ART_GRENZEN.name.max),
  familieLateinisch: optional("familieLateinisch", ART_GRENZEN.name.max),
  schwierigkeit: ganzzahlFeld("schwierigkeit", ART_GRENZEN.schwierigkeit),
  standardStufe: ganzzahlFeld("standardStufe", ART_GRENZEN.standardStufe),
  lichtbedarfLux: ganzzahlFeld("lichtbedarfLux", LICHT.luxDecke),
  ruheVon: monatTag("ruheVon"),
  ruheBis: monatTag("ruheBis"),
  standortHinweis: optional("standortHinweis", ART_GRENZEN.kurz.max),
  wachstumsmass: wahlFeld("wachstumsmass", WACHSTUMSMASSE),
  vergeilungAnzeichen: textFeld("vergeilungAnzeichen", ART_GRENZEN.lang),
  giesshinweis: optional("giesshinweis", ART_GRENZEN.kurz.max),
  substrat: optional("substrat", ART_GRENZEN.kurz.max),
  rueckschnitt: optional("rueckschnitt", ART_GRENZEN.kurz.max),
  wuchsHacks: optional("wuchsHacks", ART_GRENZEN.kurz.max),
  erfolgskriterien: textFeld("erfolgskriterien", ART_GRENZEN.lang),
  botanischeStory: optional("botanischeStory", ART_GRENZEN.lang.max),
  quelle: optional("quelle", ART_GRENZEN.kurz.max),
});

export type ArtEingabe = ReturnType<typeof basis> extends Ergebnis<infer T> ? T : never;

/** Die Ruhephase gilt nur als Paar (von und bis), sonst ist sie unbekannt. */
export function artSchema(eingabe: unknown): Ergebnis<ArtEingabe> {
  const r = basis(eingabe);
  if (!r.ok || (r.wert.ruheVon === null) === (r.wert.ruheBis === null)) return r;
  const feld = r.wert.ruheVon === null ? "ruheVon" : "ruheBis";
  return fehlgeschlagen(fehler("eingabe.ungueltig", { details: [ungueltig(feld)] }));
}
