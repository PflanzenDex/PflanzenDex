import type { Art } from "../katalog";

/** Der Name der Art, wie der Halter sie nennt: deutsch, sonst lateinisch (Annahme; nie ein erfundener Name, P-08). */
export function artAnzeigename(art: Pick<Art, "deutscherName" | "lateinischerName">): string {
  return art.deutscherName ?? art.lateinischerName;
}

/** Namensregel DM-BES-03: `Art`, mit Kennzeichen `Art – Kennzeichen` (Gedankenstrich mit Leerzeichen). */
export function exemplarName(artName: string, kennzeichen: string | null): string {
  return kennzeichen ? `${artName} – ${kennzeichen}` : artName;
}
