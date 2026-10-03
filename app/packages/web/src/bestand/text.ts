import type { ApiFehler } from "../kern";

/** P-08: Was fehlt, heißt „unbekannt“ und wird nie mit einem Wert gefüllt. */
export const UNBEKANNT = "unbekannt";

/** `JJJJ-MM-TT` als „03.10.2026“ (ohne Zeitzonenumrechnung: es ist ein Kalenderdatum, NFR-08). */
export function datumText(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

export interface Namenskonflikt {
  name: string;
  vorhandene: { id: string; name: string }[];
}

/** Bei `exemplar.name_vergeben` liefert der Server den Namen und die vorhandenen Exemplare der Art mit. */
export function namenskonflikt(fehler: ApiFehler): Namenskonflikt | null {
  if (fehler.code !== "exemplar.name_vergeben") return null;
  const daten = fehler.daten as unknown as Partial<Namenskonflikt> | undefined;
  return { name: daten?.name ?? "", vorhandene: daten?.vorhandene ?? [] };
}
