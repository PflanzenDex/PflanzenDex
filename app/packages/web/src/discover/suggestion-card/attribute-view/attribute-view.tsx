import type { AttributeSource, SuggestionAttributes } from "@pflanzendex/core";
import { dateText } from "@/lib/format";
import table from "../../discover.de.json";
import { texts } from "@/lib/text-rules/texts";

const t = texts(table);

const LEVEL = {
  low: t("attributes.level.low"),
  medium: t("attributes.level.medium"),
  high: t("attributes.level.high"),
} as const;
const SIZE = {
  small: t("attributes.size.small"),
  medium: t("attributes.size.medium"),
  large: t("attributes.size.large"),
} as const;
const LIGHT = {
  low: t("attributes.light.low"),
  medium: t("attributes.light.medium"),
  bright_indirect: t("attributes.light.brightIndirect"),
  direct_sun: t("attributes.light.directSun"),
} as const;
export const UNKNOWN = t("attributes.unknown");
const SOURCE = { gbif: "GBIF", wikipedia: "Wikipedia", wikidata: "Wikidata" } as const;
const FIELD_NAME: Record<AttributeSource["field"], string> = {
  humidity: t("attributes.row.humidity"),
  minTemperature: t("attributes.row.minTemperature"),
  toxicToPets: t("attributes.row.toxicToPets"),
  growthSize: t("attributes.row.growthSize"),
  lightDescription: t("attributes.row.lightDescription"),
};

/** Attributes of DM-ENT-01; a value the catalog does not know reads "unbekannt" (P-08, FR-ENT-04). */
export function attributeRows(a: SuggestionAttributes): [string, string][] {
  const pets =
    a.toxicToPets === null
      ? UNKNOWN
      : a.toxicToPets
        ? t("attributes.toxic")
        : t("attributes.nonToxic");
  return [
    [FIELD_NAME.humidity, a.humidity === null ? UNKNOWN : LEVEL[a.humidity]],
    [
      FIELD_NAME.minTemperature,
      a.minTemperature === null
        ? UNKNOWN
        : t("attributes.temperature", { value: a.minTemperature }),
    ],
    [FIELD_NAME.toxicToPets, pets],
    [FIELD_NAME.growthSize, a.growthSize === null ? UNKNOWN : SIZE[a.growthSize]],
    [
      FIELD_NAME.lightDescription,
      a.lightDescription === null ? UNKNOWN : LIGHT[a.lightDescription],
    ],
  ];
}

/**
 * Where each known attribute comes from (US-ENT-09, P-08): source as a link, license, retrieval date and the review
 * status. Nothing is listed for an unknown attribute, so no value shows up without its evidence.
 */
export function AttributeSources({ sources }: { sources: readonly AttributeSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label={t("attributes.sourcesLabel")} className="m-0 grid list-none gap-1 p-0 text-xs">
      {sources.map((a) => (
        <li key={a.field} className="text-muted-foreground">
          {t("attributes.sourceField", { field: FIELD_NAME[a.field] })}{" "}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">
            {SOURCE[a.source]}
          </a>{" "}
          {t("attributes.sourceMeta", { license: a.license, date: dateText(a.retrievedAt) })}
        </li>
      ))}
    </ul>
  );
}
