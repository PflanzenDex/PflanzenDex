import type { Art } from "@pflanzendex/core";
import type { ApiFehler } from "../kern";

const ZAHLEN = ["schwierigkeit", "standardStufe", "lichtbedarfLux"];

/** Formularwerte als Eingabe der API: Leeres entfällt (heißt „unbekannt“), Zahlen sind Zahlen, Synonyme je Zeile. */
export function formularZuEingabe(f: FormData): Record<string, unknown> {
  const eingabe: Record<string, unknown> = {};
  for (const [name, roh] of f.entries()) {
    const text = typeof roh === "string" ? roh.trim() : "";
    if (text === "") continue;
    if (name === "synonyme") {
      eingabe[name] = text
        .split(/\n/)
        .map((z) => z.trim())
        .filter(Boolean);
    } else eingabe[name] = ZAHLEN.includes(name) ? Number(text) : text;
  }
  return eingabe;
}

/** Bei `art.dublette` liefert der Server die vorhandene Art mit. */
export function dublette(fehler: ApiFehler): Art | null {
  if (fehler.code !== "art.dublette") return null;
  const daten = fehler.daten as unknown as { vorhandene?: Art } | undefined;
  return daten?.vorhandene ?? null;
}
