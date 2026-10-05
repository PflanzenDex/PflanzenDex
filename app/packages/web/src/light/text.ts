import type { Derivation, ApiError, LightLocation, LightZone, ZoneUser } from "./light-api";

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
  lightDemandLux: "Lux-Bedarf",
  standardLevel: "Standard-Stufe",
};
const ZONE_USER_KIND: Record<ZoneUser["kind"], string> = {
  location: "Standort",
  specimen: "Exemplar",
  species: "Art",
  care_profile: "Pflegeprofil der Art",
  wish: "Wunsch",
};

export const userText = (n: ZoneUser) => `${ZONE_USER_KIND[n.kind]}: ${n.name}`;

/** Fields the server complained about, in the words of the UI. */
export function fieldNames(f: ApiError): string[] {
  return (f.details ?? []).map((d) => FIELDS[d.field] ?? d.field);
}

const REASON: Record<string, string> = {
  standard:
    "Die Art bleibt bei ihrer Standard-Stufe: die nächste Zone wäre mehr Licht als sie braucht (mehr Licht bringt Stress).",
  promoted:
    "Der Lux-Bedarf erreicht mindestens 80 % der Lux-Decke der Stufe darunter und liegt nicht mehr als 30 % unter der Decke dieser Zone.",
  need_to_low_for_higher_zone:
    "Die nächste Zone wäre mehr Licht als die Art braucht (mehr Licht bringt Stress). Sie bleibt hier.",
  soft_leaf:
    "Weichblättrige C3-Pflanzen werden nicht automatisch in eine stärkere Zone eingestuft. Sie bleibt bei der Standard-Stufe.",
  top_zone: "Das ist die höchste Zone deines Kontos.",
  no_need:
    "Für diese Art ist kein Lux-Bedarf bekannt. Trage ihn im Katalog ein, dann wird die Zone abgeleitet.",
  no_adult_zone:
    "Du hast keine Zone für erwachsene Pflanzen. Lege eine zweite Lichtzone an (die erste ist Stecklingslicht).",
};

export const derivationText = (a: Derivation): { title: string; reason: string } => ({
  title: a.kind === "zone" ? `Lichtzone: ${a.zone.name}` : "Lichtzone: unbekannt",
  reason: REASON[a.reason] ?? "",
});
