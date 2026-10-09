// Shapes of the prioritized candidate list (US-WUN-01): derived on every request, never stored (P-01).
import type { WishStore, ZoneStock, ZoneStockSource } from "../types";

/**
 * Why a candidate stands where it stands (the "why" of the priority, P-09). `thinnest`: its zone has the fewest
 * specimens; `tie`: all zones 2 to 4 are equally full; `other`: another zone has more room; `zone_unknown`: no target
 * zone, `zone_outside`: a target zone that is not among zones 2 to 4 (for example the cutting light); both do not
 * count (FR-WUN-03, P-10).
 */
export type PriorityKind = "thinnest" | "tie" | "other" | "zone_unknown" | "zone_outside";

export interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly german: string | null;
  /** "German (name)"; just the name while no German name is known (P-08). */
  readonly title: string;
  /** Target zone 2 to 4 of the account; `null` = unknown. */
  readonly zone: { readonly id: string; readonly name: string } | null;
  /** Specimens in the target zone; `null` = unknown, never a guess (P-08). */
  readonly stock: number | null;
  /** "<zone> — N Pflanzen", or "Ziel-Zone unbekannt". */
  readonly zoneText: string;
  readonly difficulty: number | null;
  readonly reasoning: string | null;
  /**
   * The picture: origin address, source, license (`null` while unknown, P-08) and whether a local copy is stored
   * (US-WUN-04). The copy is served only to the owner; its object name is never exposed (P-05).
   */
  readonly image: {
    readonly url: string;
    readonly source: string;
    readonly license: string | null;
    readonly stored: boolean;
  } | null;
  readonly priority: { readonly kind: PriorityKind; readonly text: string };
}

/** An open wish whose name equals another wish after folding (FR-WUN-06, #303); it can be renamed or deleted. */
export interface DuplicateWish {
  readonly id: string;
  readonly name: string;
  readonly title: string;
}

/** A zone 2 to 4 with fewer open candidates than the buffer (US-WUN-02). */
export interface ReplenishZone {
  readonly zoneId: string;
  readonly name: string;
  readonly open: number;
  /** "Nachschub nötig: <zone> (N offene Kandidaten)". */
  readonly text: string;
}

export interface Replenishment {
  /** Open candidates every zone 2 to 4 should have at least. */
  readonly buffer: number;
  /** Zones below the buffer, in zone order; empty = nothing to warn about. */
  readonly zones: readonly ReplenishZone[];
  /** Which actions of the warning exist: "Discover for <zone>" (US-ENT-07), "Fetch suggestions" (US-WUN-04). */
  readonly actions: { readonly discover: boolean; readonly suggestions: boolean };
  /** What to do now; `null` without a warning (P-09). */
  readonly nextAction: string | null;
}

export interface CandidateList {
  /** Open candidates, the zone with the fewest specimens first; unknown zone last. */
  readonly candidates: readonly Candidate[];
  /** Zones 2 to 4 with their stock, for the form (target zone) and the overview. */
  readonly zones: readonly ZoneStock[];
  /** What the list says and what to do next (P-09). */
  readonly hint: { readonly text: string; readonly nextAction: string };
  /** Open wishes that share a name with another wish (migration 0020); empty when there are none. */
  readonly duplicates: readonly DuplicateWish[];
  /** Says what is wrong and what to do (P-09); `null` when there are no duplicates. */
  /** The warning before the list runs empty (US-WUN-02). */
  readonly replenishment: Replenishment;
  readonly duplicateHint: { readonly text: string; readonly nextAction: string } | null;
}

export interface CandidatesDependencies {
  readonly wishes: Pick<WishStore, "open" | "keyless">;
  readonly stock: ZoneStockSource;
}
