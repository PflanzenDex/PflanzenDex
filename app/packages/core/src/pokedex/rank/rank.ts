// Collector rank and progress (US-POK-10): derived from the number of caught species, never stored (P-01). Totals
// come from the taxonomy tree (US-POK-03); without a tree they stay unknown, no number is invented (P-08).

export type CollectorRank =
  "seedling" | "sapling" | "young_plant" | "bloomer" | "treetop" | "botanist";

/** Lowest number of caught species of each rank, ascending. */
const RANKS: readonly { rank: CollectorRank; from: number }[] = [
  { rank: "seedling", from: 0 },
  { rank: "sapling", from: 5 },
  { rank: "young_plant", from: 15 },
  { rank: "bloomer", from: 30 },
  { rank: "treetop", from: 60 },
  { rank: "botanist", from: 100 },
];

/** What the taxonomy tree knows (US-POK-03); `null` for the whole tree while it does not exist. */
export interface TreeTotals {
  readonly speciesTotal: number;
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
  readonly species: { caught: number; total: number | null; percent: number | null };
  readonly orders: { discovered: number | null; total: number | null };
}

function treeFigures(caught: number, tree: TreeTotals | null) {
  const total = tree?.speciesTotal ?? null;
  return {
    species: {
      caught,
      total,
      percent: total !== null && total > 0 ? Math.round((caught / total) * 100) : null,
    },
    orders: { discovered: tree?.ordersDiscovered ?? null, total: tree?.orderTotal ?? null },
  };
}

export function collectorProgress(caught: number, tree: TreeTotals | null): CollectorProgress {
  const index = Math.max(
    0,
    RANKS.findLastIndex((r) => caught >= r.from),
  );
  const current = RANKS[index] ?? RANKS[0];
  const upcoming = RANKS[index + 1];
  return {
    rank: current?.rank ?? "seedling",
    next: upcoming ? { rank: upcoming.rank, remaining: upcoming.from - caught } : null,
    fraction: upcoming && current ? (caught - current.from) / (upcoming.from - current.from) : 1,
    treeState: tree === null ? "missing" : "built",
    ...treeFigures(caught, tree),
  };
}
