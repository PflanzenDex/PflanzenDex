import { istZeitzone } from "./datum";
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

/** Ganze Zahl innerhalb der Grenzen. */
export function ganzzahlFeld(feld: string, grenzen: { min: number; max: number }) {
  return (wert: unknown): number | Fehlerdetail =>
    typeof wert === "number" && Number.isInteger(wert) && wert >= grenzen.min && wert <= grenzen.max
      ? wert
      : ungueltig(feld);
}

export function wahlFeld<const W extends string>(feld: string, erlaubt: readonly W[]) {
  return (wert: unknown): W | Fehlerdetail => erlaubt.find((e) => e === wert) ?? ungueltig(feld);
}

/** Ein IANA-Zeitzonenname, z. B. `Europe/Berlin` (NFR-08). */
export function zeitzoneFeld(feld: string) {
  return (wert: unknown): string | Fehlerdetail => (istZeitzone(wert) ? wert : ungueltig(feld));
}

/** Fehlt der Wert (undefined oder null), ist er „nicht angegeben“ (null); sonst gilt die Prüfung. */
export function oderNull<T>(pruefe: (wert: unknown) => T | Fehlerdetail) {
  return (wert: unknown): T | Fehlerdetail | null =>
    wert === undefined || wert === null ? null : pruefe(wert);
}

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const istKennung = (wert: unknown): wert is string =>
  typeof wert === "string" && KENNUNG.test(wert);

/** Eine UUID (klein geschrieben zurückgegeben). */
export function kennungFeld(feld: string) {
  return (wert: unknown): string | Fehlerdetail =>
    typeof wert === "string" && KENNUNG.test(wert) ? wert.toLowerCase() : ungueltig(feld);
}

/** Kleinbuchstaben und Unterstriche, z. B. `art`. */
export function bezeichnerFeld(feld: string, max: number) {
  return (wert: unknown): string | Fehlerdetail =>
    typeof wert === "string" && wert.length <= max && /^[a-z_]+$/.test(wert)
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
