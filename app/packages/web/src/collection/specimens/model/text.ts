import { zoneLabel } from "@pflanzendex/core";
import type { SpecimenCard, ZoneSource } from "@pflanzendex/core";
import type { ApiError } from "../../../kernel";
import { UNKNOWN } from "@/lib/format";

export { UNKNOWN, dateText, valueText } from "@/lib/format";

export interface NameConflict {
  name: string;
  existing: { id: string; name: string }[];
}

/**
 * For `specimen.name_taken` and `specimen.marker_required` the server also supplies the name and the existing
 * specimens of the species.
 */
export function nameConflict(error: ApiError): NameConflict | null {
  if (error.code !== "specimen.name_taken" && error.code !== "specimen.marker_required")
    return null;
  const data = error.data as unknown as Partial<NameConflict> | undefined;
  return { name: data?.name ?? "", existing: data?.existing ?? [] };
}

/** Where the effective zone comes from (FR-LIC-02, #592): the same rule as the distribution. */
export const ZONE_SOURCE_TEXT: Record<ZoneSource, string> = {
  specimen: "von dir für diese Pflanze gesetzt",
  location: "vom Standort",
  profile: "aus deinem Pflegeprofil",
  species: "aus dem Lichtbedarf der Art",
  cutting: "Stecklingslicht",
};
export const zoneText = (card: SpecimenCard): string =>
  card.lightZone && card.lightZoneSource
    ? `${zoneLabel(card.lightZone)} (${ZONE_SOURCE_TEXT[card.lightZoneSource]})`
    : UNKNOWN;
