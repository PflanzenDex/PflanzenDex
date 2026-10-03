import type { ApiError, LightLocation, LightZone, ZoneUser } from "./light-api";

const numberFormat = new Intl.NumberFormat("de-DE");

export const lux = (n: number) => `${numberFormat.format(n)} Lux`;
export const ppfd = (n: number | null) =>
  n === null ? "PPFD unbekannt" : `PPFD ${numberFormat.format(n)} µmol/m²/s`;
export const kindText = (a: LightLocation["kind"]) => (a === "indoor" ? "innen" : "außen");

export const zoneName = (zones: readonly LightZone[], id: string | null): string | null =>
  id === null ? null : (zones.find((z) => z.id === id)?.name ?? null);

const FIELDS: Record<string, string> = {
  name: "Name",
  luxCeiling: "Lux-Decke",
  ppfd: "PPFD",
  sortOrder: "Reihenfolge",
  species: "Art",
  lightZoneId: "Lichtzone",
};
const ZONE_USER_KIND: Record<ZoneUser["kind"], string> = {
  location: "Standort",
  specimen: "Exemplar",
  species: "Art",
};

export const userText = (n: ZoneUser) => `${ZONE_USER_KIND[n.kind]}: ${n.name}`;

/** Fields the server complained about, in the words of the UI. */
export function fieldNames(f: ApiError): string[] {
  return (f.details ?? []).map((d) => FIELDS[d.field] ?? d.field);
}
