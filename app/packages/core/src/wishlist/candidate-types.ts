// Shapes of the prioritized candidate list (US-WUN-01): derived on every request, never stored (P-01).
import type { WishStore, ZoneStock, ZoneStockSource } from "./types";

/**
 * Why a candidate stands where it stands (the "why" of the priority, P-09). `thinnest`: its zone has the fewest
 * specimens; `tie`: all zones 2 to 4 are equally full; `other`: another zone has more room; `zone_unknown`: no target
 * zone 2 to 4, the wish does not count (FR-WUN-03, P-10).
 */
export type PriorityKind = "thinnest" | "tie" | "other" | "zone_unknown";

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
  readonly image: { readonly url: string; readonly source: string } | null;
  readonly priority: { readonly kind: PriorityKind; readonly text: string };
}

export interface CandidateList {
  /** Open candidates, the zone with the fewest specimens first; unknown zone last. */
  readonly candidates: readonly Candidate[];
  /** Zones 2 to 4 with their stock, for the form (target zone) and the overview. */
  readonly zones: readonly ZoneStock[];
  /** What the list says and what to do next (P-09). */
  readonly hint: { readonly text: string; readonly nextAction: string };
}

export interface CandidatesDependencies {
  readonly wishes: Pick<WishStore, "open">;
  readonly stock: ZoneStockSource;
}
