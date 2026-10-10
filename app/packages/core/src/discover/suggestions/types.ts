// Discover suggestions (US-ENT-01): derived on every request from the catalog tree, the ownership and the wishes; nothing
// is stored (P-01, NFR-04). Unknown values stay `null`, the interface shows "unbekannt" (P-08).
import type { OwnershipDependencies, TaxonCardSource } from "../../pokedex";
import type { WishStore, ZoneStockSource } from "../../wishlist";

/** Starting value of the deck size (DM-ENT-03, assumption, readjustable). */
export const DECK_SIZE = 10;

/** Starting value of the exploration cards per deck (DM-ENT-03, US-ENT-06, assumption, readjustable). */
export const EXPLORATION_PER_DECK = 2;

/**
 * The attributes of DM-ENT-01. The catalog does not carry them yet, so every value is `null` ("unbekannt", FR-ENT-04)
 * until the enrichment exists; no value is guessed (P-08).
 */
export interface SuggestionAttributes {
  readonly humidity: "low" | "medium" | "high" | null;
  readonly minTemperature: number | null;
  readonly toxicToPets: boolean | null;
  readonly growthSize: "small" | "medium" | "large" | null;
}

export interface Suggestion {
  /** Latin name of the species. */
  readonly species: string;
  readonly germanName: string | null;
  readonly summary: string | null;
  /** Language of `summary` (WCAG 3.1.2); `null` = unknown, then no `lang` is claimed. */
  readonly summaryLanguage: "de" | "en" | null;
  readonly family: string | null;
  /** Target light zone 2 to 4 of the catalog; `null` = unknown. */
  readonly lightZone: number | null;
  /** 1 to 3; `null` = unknown. */
  readonly difficulty: number | null;
  /** Link to the image only (P-05); `null` = no image known. */
  readonly imageUrl: string | null;
  /** Source of text and image (Wikipedia, CC BY-SA, FR-POK-07); `null` = unknown. */
  readonly sourceUrl: string | null;
  readonly attributes: SuggestionAttributes;
  /** 1 to 3 reasons from the own data, no percentage and no "match" (FR-ENT-06). */
  readonly reasons: readonly string[];
  /** An exploration card, shown as "something different" (US-ENT-06): outside the keeper's pattern. */
  readonly exploration: boolean;
}

/** Why there is nothing to suggest, and what to do next (P-09). */
export interface NoSuggestions {
  readonly reason: "catalog_empty" | "all_decided" | "deck_exhausted";
  readonly text: string;
  readonly nextAction: string;
}

export interface SuggestionDeck {
  /** Deck number, starting at 1. */
  readonly deck: number;
  readonly suggestions: readonly Suggestion[];
  /** `null` while there are suggestions. */
  readonly empty: NoSuggestions | null;
}

export interface SuggestionsDependencies {
  readonly ownership: OwnershipDependencies;
  readonly tree: TaxonCardSource;
  readonly wishes: Pick<WishStore, "open" | "bought" | "discarded">;
  /** Stock per light zone 2 to 4 (US-LIC-02) for the space reason; without it no space reason arises (P-08). */
  readonly stock?: Pick<ZoneStockSource, "stock">;
  /** The clock for the local day that fixes the exploration picks (FR-ENT-05); defaults to the system clock. */
  readonly clock?: () => Date;
}
