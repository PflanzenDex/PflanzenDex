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
    const place = key === "" ? "Standort unbekannt" : key;
    return {
      key: key === "" ? "unknown" : key,
      title: `${place} · ${zone ?? "Zone unbekannt"} · ${count(group.length)}`,
      items: group,
    };
  });
}
