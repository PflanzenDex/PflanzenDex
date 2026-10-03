import type { Fehlerdetail } from "../kern";

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Ein echtes Kalenderdatum `JJJJ-MM-TT` (kein 30. Februar), als lokales Datum des Nutzers (NFR-08). */
export function datumFeld(feld: string) {
  return (wert: unknown): string | Fehlerdetail => {
    const teile = typeof wert === "string" ? DATUM.exec(wert) : null;
    if (teile) {
      const [, j, m, t] = teile.map(Number);
      const d = new Date(Date.UTC(j as number, (m as number) - 1, t as number));
      if (d.getUTCFullYear() === j && d.getUTCMonth() === (m as number) - 1 && d.getUTCDate() === t)
        return wert as string;
    }
    return { feld, code: "eingabe.ungueltig" };
  };
}

/** Eine Zahl im Raster des Schritts (0,5): ohne Raster müsste die Datenbank still runden (P-10). */
export function rasterFeld(feld: string, grenzen: { min: number; max: number }, schritt: number) {
  return (wert: unknown): number | Fehlerdetail =>
    typeof wert === "number" &&
    Number.isFinite(wert) &&
    wert >= grenzen.min &&
    wert <= grenzen.max &&
    Number.isInteger(wert / schritt)
      ? wert
      : { feld, code: "eingabe.ungueltig" };
}
