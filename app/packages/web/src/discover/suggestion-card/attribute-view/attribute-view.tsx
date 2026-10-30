import type { AttributeSource, SuggestionAttributes } from "@pflanzendex/core";
import { dateText } from "@/lib/format";

const LEVEL = { low: "niedrig", medium: "mittel", high: "hoch" } as const;
const SIZE = { small: "klein", medium: "mittel", large: "groß" } as const;
const LIGHT = {
  low: "wenig Licht",
  medium: "mittleres Licht",
  bright_indirect: "helles indirektes Licht",
  direct_sun: "direkte Sonne",
} as const;
export const UNKNOWN = "unbekannt";
const SOURCE = { gbif: "GBIF", wikipedia: "Wikipedia", wikidata: "Wikidata" } as const;
const FIELD_NAME: Record<AttributeSource["field"], string> = {
  humidity: "Luftfeuchte",
  minTemperature: "Mindesttemperatur",
  toxicToPets: "Haustiere",
  growthSize: "Wuchsgröße",
  lightDescription: "Licht laut Quelle",
};

/** Attributes of DM-ENT-01; a value the catalog does not know reads "unbekannt" (P-08, FR-ENT-04). */
export function attributeRows(a: SuggestionAttributes): [string, string][] {
  const pets = a.toxicToPets === null ? UNKNOWN : a.toxicToPets ? "giftig" : "ungiftig";
  return [
    ["Luftfeuchte", a.humidity === null ? UNKNOWN : LEVEL[a.humidity]],
    ["Mindesttemperatur", a.minTemperature === null ? UNKNOWN : `${a.minTemperature} °C`],
    ["Haustiere", pets],
    ["Wuchsgröße", a.growthSize === null ? UNKNOWN : SIZE[a.growthSize]],
    ["Licht laut Quelle", a.lightDescription === null ? UNKNOWN : LIGHT[a.lightDescription]],
  ];
}

/**
 * Where each known attribute comes from (US-ENT-09, P-08): source as a link, license, retrieval date and the review
 * status. Nothing is listed for an unknown attribute, so no value shows up without its evidence.
 */
export function AttributeSources({ sources }: { sources: readonly AttributeSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Quellen der Merkmale" className="m-0 grid list-none gap-1 p-0 text-xs">
      {sources.map((a) => (
        <li key={a.field} className="text-muted-foreground">
          {FIELD_NAME[a.field]}:{" "}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">
            {SOURCE[a.source]}
          </a>{" "}
          ({a.license}, abgerufen am {dateText(a.retrievedAt)}), ungeprüft
        </li>
      ))}
    </ul>
  );
}
