// Deviations of US-QS-04 in the today list: an etiolated last measurement (US-WAC-02) and a zone below the buffer of
// open candidates (US-WUN-02). Both reuse the derivation of their module; this file only turns them into items with a
// next action (P-09). Read only, nothing is stored (P-01).
import { isActive, type MeasurementSource, type SpecimenRow } from "../collection";
import { replenishment, type WishStore, type ZoneStockSource } from "../wishlist";
import type { TodayItem } from "./today-types";

export interface DeviationDependencies {
  /** Last measurement per specimen (the port of the cards, implemented by `care`). */
  readonly measurements: MeasurementSource;
  readonly wishes: Pick<WishStore, "open">;
  /** Stock per zone 2 to 4, the same counting as the distribution (FR-LIC-04). */
  readonly stock: ZoneStockSource;
}

/** `YYYY-MM-DD` as German date `DD.MM.YYYY`; the calendar date stays as stored (NFR-08). */
const germanDate = (date: string) => date.split("-").reverse().join(".");

/** Active specimens whose last measurement is etiolated; etiolated growth never counts as success (P-08). */
export async function etiolatedItems(
  deps: DeviationDependencies,
  userId: string,
  rows: readonly SpecimenRow[],
): Promise<TodayItem[]> {
  const active = rows.filter(isActive);
  if (active.length === 0) return [];
  const views = await deps.measurements.forSpecimens(
    userId,
    active.map((r) => r.id),
  );
  return active.flatMap((r): TodayItem[] => {
    const last = views.get(r.id)?.last;
    if (last?.quality !== "etiolated") return [];
    return [
      {
        id: `etiolated:${r.id}`,
        kind: "measurement_etiolated",
        specimenId: r.id,
        specimenName: r.name,
        text: `„${r.name}“: Die letzte Messung vom ${germanDate(last.date)} ist vergeilt/dünn.`,
        nextAction: "Stelle das Exemplar heller und miss erneut, ob es gesund nachwächst.",
        target: "measurements",
      },
    ];
  });
}

/** One item per zone 2 to 4 below the buffer of open candidates, with the action of the wishlist (US-WUN-02). */
export async function bufferItems(
  deps: DeviationDependencies,
  userId: string,
): Promise<TodayItem[]> {
  const [open, zones, buffer] = await Promise.all([
    deps.wishes.open(userId),
    deps.stock.stock(userId),
    deps.stock.buffer?.(userId),
  ]);
  const r = replenishment(open, zones, buffer);
  if (r.nextAction === null) return [];
  const nextAction = r.nextAction;
  return r.zones.map((z) => ({
    id: `buffer:${z.zoneId}`,
    kind: "buffer_low",
    specimenId: null,
    specimenName: null,
    text: z.text,
    nextAction,
    target: "wishlist",
  }));
}
