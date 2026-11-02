// The collection as the AI client reads it (US-KI-11): the rows of the app with the ids and readable names of species,
// location and light zone attached, so every reference the client sees can be used again by id or by name (FR-KI-15).
// Light zones are numbered by their order (1 = cutting light, US-LIC-05); what is unknown stays `null` (P-08).
import type { CollectionReadSource, LocationRow, SpecimenItem, ZoneRow } from "./types";

export interface ZoneRef {
  readonly id: string;
  readonly name: string;
  readonly number: number;
}

export interface SpecimenOut {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly marker: string | null;
  /** `name: null` = the species is unknown to the account (P-08). */
  readonly species: { readonly id: string; readonly name: string | null };
  readonly location: { readonly id: string | null; readonly name: string } | null;
  readonly lightZone: (ZoneRef & { readonly source: string | null }) | null;
  readonly caughtAt: string | null;
  readonly archivedAt: string | null;
}

export interface CollectionView {
  readonly rows: readonly SpecimenItem[];
  readonly specimens: readonly SpecimenOut[];
  readonly locations: readonly LocationRow[];
  readonly zones: readonly ZoneRow[];
  readonly zoneNumbers: ReadonlyMap<string, number>;
  readonly locationItems: readonly LocationOut[];
  readonly zoneItems: readonly ZoneOut[];
}

export interface LocationOut {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly lightZone: ZoneRef | null;
}

export interface ZoneOut extends ZoneRef {
  readonly luxCeiling: number;
  readonly ppfd: number | null;
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

function zoneRefOf(zones: readonly ZoneRow[], numbers: ReadonlyMap<string, number>) {
  return (pick: (z: ZoneRow) => boolean): ZoneRef | null => {
    const z = zones.find(pick);
    return z ? { id: z.id, name: z.name, number: numbers.get(z.id) ?? 0 } : null;
  };
}

function specimenOut(
  s: SpecimenItem,
  locations: readonly LocationRow[],
  zoneRef: ReturnType<typeof zoneRefOf>,
): SpecimenOut {
  const location = s.location === null ? null : locations.find((l) => l.name === s.location);
  const zone = s.lightZone === null ? null : zoneRef((z) => z.name === s.lightZone);
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    marker: s.marker,
    species: { id: s.speciesId, name: s.speciesName },
    location: s.location === null ? null : { id: location?.id ?? null, name: s.location },
    lightZone: zone ? { ...zone, source: s.lightZoneSource } : null,
    caughtAt: s.caughtAt,
    archivedAt: s.archivedAt,
  };
}

/** Loads the account's places (and with a time zone its specimens) and attaches ids, names and zone numbers. */
export async function collectionView(
  source: CollectionReadSource,
  userId: string,
  timeZone: string | null,
): Promise<CollectionView> {
  const [rows, locations, zoneRows] = await Promise.all([
    timeZone === null ? [] : source.specimens(userId, timeZone),
    source.locations(userId),
    source.zones(userId),
  ]);
  const zones = [...zoneRows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const zoneNumbers = new Map(zones.map((z, i) => [z.id, i + 1] as const));
  const zoneRef = zoneRefOf(zones, zoneNumbers);
  return {
    rows,
    specimens: rows.map((s) => specimenOut(s, locations, zoneRef)).sort(byName),
    locations,
    zones,
    zoneNumbers,
    locationItems: [...locations].sort(byName).map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      lightZone: l.lightZoneId === null ? null : zoneRef((z) => z.id === l.lightZoneId),
    })),
    zoneItems: zones.map((z, i) => ({
      id: z.id,
      name: z.name,
      number: i + 1,
      luxCeiling: z.luxCeiling,
      ppfd: z.ppfd,
    })),
  };
}
