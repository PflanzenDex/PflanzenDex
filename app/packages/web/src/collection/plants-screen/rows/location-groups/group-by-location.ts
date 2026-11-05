/** What the grouping needs of a plant: where it stands and the zone of that place; `null` means unknown (P-08). */
export interface Placed {
  readonly location: string | null;
  readonly lightZone: string | null;
}

export interface LocationGroup<T extends Placed> {
  /** Stable key: the location name, or `unknown` for plants without a known location. */
  readonly key: string;
  /** The heading text: "Wohnzimmer · Zone 2 · 3 Pflanzen", unknown values are named, never left out (P-08). */
  readonly title: string;
  readonly items: readonly T[];
}

const count = (n: number) => (n === 1 ? "1 Pflanze" : `${n} Pflanzen`);

/**
 * The heading of a group: the place, its zone and the number of plants (FR-BES-23: the full count of the server). The zone
 * reads "Zone unbekannt" when it is `null` (P-08); `undefined` means the zone is not loaded yet, so it is left out.
 */
export function groupTitle(place: string, zone: string | null | undefined, n: number): string {
  return [place, ...(zone === undefined ? [] : [zone ?? "Zone unbekannt"]), count(n)].join(" · ");
}

/** The place name of a group; the plants without a known place form "Standort unbekannt" (P-08, P-10). */
export const UNKNOWN_PLACE = "Standort unbekannt";

/** A location of the server's summary with its number of plants (US-QS-14). */
export interface LocationCount {
  readonly locationId: string;
  readonly location: string | null;
  readonly count: number;
}

/**
 * The choices of the grouping by location (US-QS-14, US-QS-19): the known places alphabetically, then a place whose name
 * is unknown, and the plants without a place last as "Standort unbekannt". Keys are location IDs, `unplaced` for the last.
 */
export function locationChoices(groups: readonly LocationCount[], unplaced: number) {
  const named = groups
    .map((g) => ({
      key: g.locationId,
      label: g.location ?? UNKNOWN_PLACE,
      count: g.count,
      name: g.location,
    }))
    .sort((a, b) => (a.name ?? "\uffff").localeCompare(b.name ?? "\uffff", "de"));
  return [
    ...named.map(({ key, label, count }) => ({ key, label, count })),
    ...(unplaced > 0 ? [{ key: UNPLACED_KEY, label: UNKNOWN_PLACE, count: unplaced }] : []),
  ];
}

/** The key of the plants without a location in the grouping by location (the server filter is `location=none`). */
export const UNPLACED_KEY = "unplaced";

/**
 * Groups plants by the location they stand at (US-QS-14, US-LIC): known locations in alphabetical order, the plants
 * without a known location last under "Standort unbekannt". The zone belongs to the location; when the plants of one
 * location disagree (a specimen override), the zone is the first plant's, so the heading never invents a value.
 */
export function groupByLocation<T extends Placed>(items: readonly T[]): LocationGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const item of items) {
    const key = item.location ?? "";
    by.set(key, [...(by.get(key) ?? []), item]);
  }
  const known = [...by.keys()].filter((k) => k !== "").sort((a, b) => a.localeCompare(b, "de"));
  const order = by.has("") ? [...known, ""] : known;
  return order.map((key) => {
    const group = by.get(key) ?? [];
    const zone = group[0]?.lightZone ?? null;
    const place = key === "" ? UNKNOWN_PLACE : key;
    return {
      key: key === "" ? "unknown" : key,
      title: groupTitle(place, zone, group.length),
      items: group,
    };
  });
}
