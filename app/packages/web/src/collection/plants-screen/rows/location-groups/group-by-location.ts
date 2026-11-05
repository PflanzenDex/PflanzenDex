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
