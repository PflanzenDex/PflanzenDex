// Collector rank and progress (US-POK-10): derived from the number of caught species, never stored (P-01). Totals
// come from the taxonomy tree (US-POK-03); without a tree they stay unknown, no number is invented (P-08).

export type CollectorRank =
  "seedling" | "sapling" | "young_plant" | "bloomer" | "treetop" | "botanist";

/** Lowest number of caught species of each rank, ascending. */
export const COLLECTOR_RANKS: readonly { rank: CollectorRank; from: number }[] = [
  { rank: "seedling", from: 0 },
  { rank: "sapling", from: 5 },
  { rank: "young_plant", from: 15 },
  { rank: "bloomer", from: 30 },
  { rank: "treetop", from: 60 },
  { rank: "botanist", from: 100 },
];

/** What the taxonomy tree knows (US-POK-03); `null` for the whole tree while it does not exist. */
export interface TreeTotals {
  /** Species of the tree, each Latin name once. */
  readonly speciesTotal: number;
  /** Caught species that are in the tree: the number the rank and "N / M" count (owner decision 2026-11-07). */
  readonly speciesCaught: number;
  readonly orderTotal: number;
  /** Orders with at least one caught species. */
  readonly ordersDiscovered: number;
}

export interface CollectorProgress {
  readonly rank: CollectorRank;
  /** `null` at the top rank. */
  readonly next: { readonly rank: CollectorRank; readonly remaining: number } | null;
  /** Progress from this rank to the next one, 0..1 (1 at the top rank). */
  readonly fraction: number;
  readonly treeState: "built" | "missing";
  /**
   * Caught species the rank and the totals count: the caught species of the tree, or every caught species without a
   * tree (the rank then, as before the tree; the total stays unknown).
   */
  readonly species: { caught: number; total: number | null; percent: number | null };
  /** Caught species outside the tree (own proposals not yet approved), not counted yet; `null` without a tree (P-08). */
  readonly notInTree: number | null;
  readonly orders: { discovered: number | null; total: number | null };
}

function treeFigures(counted: number, tree: TreeTotals | null) {
  const total = tree?.speciesTotal ?? null;
  return {
    species: {
      caught: counted,
      total,
      percent: total !== null && total > 0 ? Math.round((counted / total) * 100) : null,
    },
    orders: { discovered: tree?.ordersDiscovered ?? null, total: tree?.orderTotal ?? null },
  };
}

/** The rank that `counted` species reach, and the next rank above it (none at the top; US-POK-10). */
function rankSteps(counted: number) {
  const index = Math.max(
    0,
    COLLECTOR_RANKS.findLastIndex((r) => counted >= r.from),
  );
  return {
    current: COLLECTOR_RANKS[index] ?? COLLECTOR_RANKS[0],
    upcoming: COLLECTOR_RANKS[index + 1],
  };
}

/** `caught` is every caught species; with a tree the rank counts only those that are in the tree (US-POK-10). */
export function collectorProgress(caught: number, tree: TreeTotals | null): CollectorProgress {
  const counted = tree?.speciesCaught ?? caught;
  const { current, upcoming } = rankSteps(counted);
  return {
    rank: current?.rank ?? "seedling",
    next: upcoming ? { rank: upcoming.rank, remaining: upcoming.from - counted } : null,
    fraction: upcoming && current ? (counted - current.from) / (upcoming.from - current.from) : 1,
    treeState: tree === null ? "missing" : "built",
    notInTree: tree === null ? null : caught - tree.speciesCaught,
    ...treeFigures(counted, tree),
  };
}
