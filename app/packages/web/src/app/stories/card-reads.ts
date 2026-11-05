import type { SpecimenCard } from "@pflanzendex/core";

/** The card reads of a list of plants as the API answers them: its first page and the summary (FR-BES-23). */
export const cardReads = (list: SpecimenCard[]) => {
  const named = list.filter((c) => c.location !== null);
  const places = [...new Set(named.map((c) => c.location))];
  return {
    "/specimens/cards": { cards: list, total: list.length, next: null },
    "/specimens/cards/summary": {
      total: list.length,
      unplaced: list.length - named.length,
      groups: places.map((name) => ({
        locationId: name,
        location: name,
        count: named.filter((c) => c.location === name).length,
      })),
      lastLocation: places[0] ?? null,
      anyMeasured: list.some((c) => c.lastMeasurement !== null),
    },
  };
};
