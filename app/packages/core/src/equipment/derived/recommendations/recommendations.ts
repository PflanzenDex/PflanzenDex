import type { Need, NeedKind } from "../needs";

/** A price with the source it comes from and the day it was retrieved (FR-EQU-09, P-08). */
export interface ProductPrice {
  readonly cents: number;
  readonly source: string;
  /** Local calendar date `YYYY-MM-DD`. */
  readonly retrievedOn: string;
}

/**
 * One entry of the product catalog the operator maintains (FR-EQU-03, FR-EQU-09). It has no field for commission or
 * partner links on purpose: the order cannot depend on them (FR-EQU-06), and links arise later from product id and
 * partner configuration (FR-EQU-04).
 */
export interface ProductEntry {
  readonly productId: string;
  readonly name: string;
  readonly manufacturer: string;
  /** The needs this product serves. */
  readonly serves: readonly NeedKind[];
  /** Fit to the need, 0 to 1, as judged by the operator when the entry was written; higher comes first. */
  readonly fit: number;
  /** Citable source of the product data and the day of retrieval (FR-EQU-09). */
  readonly source: string;
  readonly retrievedOn: string;
  readonly price?: ProductPrice;
}

/** A suggestion for one derived need. It is always a suggestion, never an order, and never carries an invented value. */
export interface Recommendation {
  readonly needId: string;
  readonly productId: string;
  readonly name: string;
  readonly manufacturer: string;
  /** The reason from the keeper's own data: the reason of the need. */
  readonly reason: string;
  readonly label: "Empfehlung";
  readonly source: string;
  readonly retrievedOn: string;
  /** Only present with source and retrieval date; otherwise no price is shown. */
  readonly price: ProductPrice | null;
  /** The non-commissioned path: name and manufacturer are shown, the keeper may buy anywhere (US-EQU-10). */
  readonly nextAction: string;
}

const NO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function usable(p: ProductEntry): boolean {
  return p.source.trim() !== "" && NO_DATE.test(p.retrievedOn);
}

function priceOf(p: ProductEntry): ProductPrice | null {
  const x = p.price;
  return x && x.source.trim() !== "" && NO_DATE.test(x.retrievedOn) && x.cents >= 0 ? x : null;
}

/**
 * Recommendations (US-EQU-10), purely derived from the needs (US-EQU-07) and the operator's catalog, only in the context
 * of a need (never on plant, Pokedex or swap cards, FR-EQU-07). An entry without source or retrieval date is dropped
 * (FR-EQU-09, P-08); a price without both is left out. The order follows the fit, then the name, never a commission
 * (FR-EQU-06). No link is built here (FR-EQU-04/05 are open).
 */
export function equipmentRecommendations(
  needs: readonly Need[],
  catalog: readonly ProductEntry[],
): Recommendation[] {
  return needs.flatMap((need) =>
    catalog
      .filter((p) => usable(p) && p.serves.includes(need.kind))
      .sort((a, b) => b.fit - a.fit || a.name.localeCompare(b.name, "de"))
      .map((p) => ({
        needId: need.id,
        productId: p.productId,
        name: p.name,
        manufacturer: p.manufacturer,
        reason: need.reason,
        label: "Empfehlung" as const,
        source: p.source,
        retrievedOn: p.retrievedOn,
        price: priceOf(p),
        nextAction: `Vergleiche „${p.name}“ von ${p.manufacturer} mit anderen Angeboten; du kannst überall kaufen.`,
      })),
  );
}
