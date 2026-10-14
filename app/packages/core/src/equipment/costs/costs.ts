import { EQUIPMENT_TYPES, type EquipmentRow, type EquipmentType } from "../store/types";

/** The acquisition costs of one type, or of all equipment: only records with a set price count (P-08). */
export interface CostLine {
  /** All records of the type (or in total). */
  readonly count: number;
  /** How many of them have a price. */
  readonly priced: number;
  /** Sum in euro over the priced records; `null` when none has a price: unknown, never 0 (P-08). */
  readonly sumEur: number | null;
}

export interface CostView {
  readonly total: CostLine & { readonly type: null };
  /** Types with at least one record, in the order of the types. */
  readonly byType: readonly (CostLine & { readonly type: EquipmentType })[];
  /** The coverage in the keeper's words, e.g. "Summe über 7 von 11 Teilen Equipment". */
  readonly coverage: string;
  /** What to do next (P-09); empty when every record has a price or there is no record. */
  readonly nextAction: string | null;
  /** What this view does not contain: no estimate without input (FR-EQU-01, P-08). */
  readonly note: string;
}

const NOTE =
  "Nicht enthalten sind Stromkosten und Ersatzkosten: Ohne deine Angaben schätzen wir nichts.";

function line(items: readonly EquipmentRow[]): CostLine {
  const prices = items.flatMap((e) => (e.priceEur === null ? [] : [e.priceEur]));
  // Sum in whole cents, so that decimals never drift (assumption: prices have at most two decimals).
  const cents = prices.reduce((sum, p) => sum + Math.round(p * 100), 0);
  return {
    count: items.length,
    priced: prices.length,
    sumEur: prices.length === 0 ? null : cents / 100,
  };
}

/**
 * The cost view (US-EQU-09): the sum of the acquisition costs per type and in total, **only** across the records with a
 * set price. It says for how many records the price is missing ("Summe über 7 von 11 Teilen Equipment") and shows
 * "unbekannt" instead of 0 where no price is known (P-08). Purely derived from the keeper's own records on every call
 * (P-01); no estimate of electricity or replacement costs. A record counts here whether it is a device or a consumable.
 */
export function equipmentCosts(items: readonly EquipmentRow[]): CostView {
  const total = line(items);
  const missing = total.count - total.priced;
  return {
    total: { ...total, type: null },
    byType: EQUIPMENT_TYPES.flatMap((type) => {
      const own = items.filter((e) => e.type === type);
      return own.length === 0 ? [] : [{ ...line(own), type }];
    }),
    coverage:
      total.count === 0
        ? "Noch kein Equipment erfasst."
        : `Summe über ${total.priced} von ${total.count} ${total.count === 1 ? "Teil" : "Teilen"} Equipment`,
    nextAction:
      missing === 0
        ? null
        : `Bei ${missing} ${missing === 1 ? "Teil fehlt" : "Teilen fehlt"} der Preis. Trage ihn beim Equipment nach, wenn du ihn kennst; sonst bleibt er unbekannt.`,
    note: NOTE,
  };
}
