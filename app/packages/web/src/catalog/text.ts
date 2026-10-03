import type { Species, GrowthMeasure } from "@pflanzendex/core";

const numberFormat = new Intl.NumberFormat("de-DE");

/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";
export const orUnknown = (value: string | null) => value ?? UNKNOWN;

export const DIFFICULTY: Record<number, string> = { 1: "Einfach", 2: "Medium", 3: "Schwer" };
export const GROWTH: Record<GrowthMeasure, string> = {
  height: "Höhe",
  rosette_diameter: "Rosettendurchmesser",
  shoot_length: "Trieblänge",
};
export const STATUS: Record<Species["reviewStatus"], string> = {
  proposal: "Vorschlag",
  ai_unreviewed: "KI-erstellt, ungeprüft",
  curated: "Kuratiert",
  reviewed: "Geprüft",
  rejected: "Zurückgewiesen",
};

export const lux = (n: number) => `${numberFormat.format(n)} Lux`;

/** `MM-DD` as "15.11.". */
const tag = (monthTag: string) => `${monthTag.slice(3)}.${monthTag.slice(0, 2)}.`;

export function dormancyPhase(species: Species): string {
  return species.dormancyFrom && species.dormancyUntil
    ? `${tag(species.dormancyFrom)} bis ${tag(species.dormancyUntil)}`
    : UNKNOWN;
}

/** Short hint for lists: only own proposals and marked species need a badge. */
export function badge(species: Species): string {
  if (species.reviewStatus === "proposal" || species.reviewStatus === "rejected")
    return `${STATUS[species.reviewStatus]}, nur für dich sichtbar`;
  return STATUS[species.reviewStatus];
}

export const FIELDS: Record<string, string> = {
  latinName: "Lateinischer Name",
  germanName: "Deutscher Name",
  englishName: "Englischer Name",
  synonyms: "Synonyme",
  familyGerman: "Familie (deutsch)",
  familyLatin: "Familie (lateinisch)",
  difficulty: "Schwierigkeit",
  standardLevel: "Standard-Stufe",
  lightDemandLux: "Lichtbedarf",
  dormancyFrom: "Ruhephase von",
  dormancyUntil: "Ruhephase bis",
  growthMeasure: "Wachstumsmaß",
  etiolationSigns: "Vergeilung-Anzeichen",
  successCriteria: "Erfolgskriterien",
};
