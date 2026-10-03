import { fehler, type Fehlerdetail } from "./fehler";
import { fehlgeschlagen, ok, type Ergebnis } from "./ergebnis";

/** Prüft unbekannte Eingabe vollständig; liefert die getypte Eingabe oder alle Fehlerdetails (P-03). */
export type Schema<T> = (eingabe: unknown) => Ergebnis<T>;

const ungueltig = (feld: string): Fehlerdetail => ({ feld, code: "eingabe.ungueltig" });

export function textFeld(feld: string, grenzen: { min: number; max: number }) {
  return (wert: unknown): string | Fehlerdetail => {
    if (typeof wert !== "string") return ungueltig(feld);
    const text = wert.trim();
    return text.length >= grenzen.min && text.length <= grenzen.max ? text : ungueltig(feld);
  };
}

export function zahlFeld(feld: string, grenzen: { min: number; max: number }) {
  return (wert: unknown): number | Fehlerdetail =>
    typeof wert === "number" && Number.isFinite(wert) && wert >= grenzen.min && wert <= grenzen.max
      ? wert
      : ungueltig(feld);
}

type Pruefer = (wert: unknown) => unknown;
type Geprueft<P extends Record<string, Pruefer>> = {
  [K in keyof P]: Exclude<ReturnType<P[K]>, Fehlerdetail>;
};

const istDetail = (x: unknown): x is Fehlerdetail =>
  typeof x === "object" && x !== null && "feld" in x && "code" in x;

/** Objekt-Schema: unbekannte Felder werden verworfen, fehlende oder ungültige melden alle Details. */
export function objekt<P extends Record<string, Pruefer>>(felder: P): Schema<Geprueft<P>> {
  return (eingabe) => {
    if (typeof eingabe !== "object" || eingabe === null || Array.isArray(eingabe)) {
      return fehlgeschlagen(fehler("eingabe.ungueltig", { details: [ungueltig("")] }));
    }
    const quelle = eingabe as Record<string, unknown>;
    const wert: Record<string, unknown> = {};
    const details: Fehlerdetail[] = [];
    for (const [name, pruefe] of Object.entries(felder)) {
      const r = pruefe(quelle[name]);
      if (istDetail(r)) details.push(r);
      else wert[name] = r;
    }
    return details.length > 0
      ? fehlgeschlagen(fehler("eingabe.ungueltig", { details }))
      : ok(wert as Geprueft<P>);
  };
}
