import type { Art, Wachstumsmass } from "@pflanzendex/core";

const zahl = new Intl.NumberFormat("de-DE");

/** P-08: Was fehlt, heißt „unbekannt“ und wird nie mit einem Wert gefüllt. */
export const UNBEKANNT = "unbekannt";
export const oderUnbekannt = (wert: string | null) => wert ?? UNBEKANNT;

export const SCHWIERIGKEIT: Record<number, string> = { 1: "Einfach", 2: "Medium", 3: "Schwer" };
export const WACHSTUM: Record<Wachstumsmass, string> = {
  hoehe: "Höhe",
  rosettendurchmesser: "Rosettendurchmesser",
  trieblaenge: "Trieblänge",
};
export const STATUS: Record<Art["pruefstatus"], string> = {
  vorschlag: "Vorschlag",
  ki_ungeprueft: "KI-erstellt, ungeprüft",
  kuratiert: "Kuratiert",
  geprueft: "Geprüft",
  zurueckgewiesen: "Zurückgewiesen",
};

export const lux = (n: number) => `${zahl.format(n)} Lux`;

/** `MM-TT` als „15.11.“. */
const tag = (monatTag: string) => `${monatTag.slice(3)}.${monatTag.slice(0, 2)}.`;

export function ruhephase(art: Art): string {
  return art.ruheVon && art.ruheBis ? `${tag(art.ruheVon)} bis ${tag(art.ruheBis)}` : UNBEKANNT;
}

/** Kurzer Hinweis für Listen: nur eigene Vorschläge und gekennzeichnete Arten brauchen eine Marke. */
export function marke(art: Art): string {
  if (art.pruefstatus === "vorschlag" || art.pruefstatus === "zurueckgewiesen")
    return `${STATUS[art.pruefstatus]}, nur für dich sichtbar`;
  return STATUS[art.pruefstatus];
}

export const FELDER: Record<string, string> = {
  lateinischerName: "Lateinischer Name",
  deutscherName: "Deutscher Name",
  englischerName: "Englischer Name",
  synonyme: "Synonyme",
  familieDeutsch: "Familie (deutsch)",
  familieLateinisch: "Familie (lateinisch)",
  schwierigkeit: "Schwierigkeit",
  standardStufe: "Standard-Stufe",
  lichtbedarfLux: "Lichtbedarf",
  ruheVon: "Ruhephase von",
  ruheBis: "Ruhephase bis",
  wachstumsmass: "Wachstumsmaß",
  vergeilungAnzeichen: "Vergeilung-Anzeichen",
  erfolgskriterien: "Erfolgskriterien",
};
