// Milestones with an instruction for action (US-POK-11): derived live from the caught species and the taxonomy tree,
// never stored (P-01). Targets come from the tree; without a tree there are no milestones, no number is invented (P-08).

export interface TreeSpecies {
  readonly latin: string;
  readonly german: string | null;
}

/** A family, genus or order of the tree with its curated species (US-POK-03). */
export interface TreeGroup {
  readonly name: string;
  readonly german: string | null;
  readonly species: readonly TreeSpecies[];
}

/** The part of the taxonomy tree the milestones need. Groups "without family/genus/order" are simply not in it. */
export interface MilestoneTree {
  readonly families: readonly TreeGroup[];
  readonly genera: readonly TreeGroup[];
  readonly orders: readonly TreeGroup[];
}

/** Caught species (Latin name) with their catch date (`null` = unknown, US-POK-07). */
export type CaughtDates = ReadonlyMap<string, string | null>;

export type MilestoneLevel = "discovered" | "connoisseur" | "complete" | "explorer";

export interface Milestone {
  /** Stable key, e.g. `family:Cactaceae:connoisseur`, `explorer`. */
  readonly id: string;
  readonly kind: "family" | "genus" | "explorer";
  readonly level: MilestoneLevel;
  /** German name of the group, else the Latin one; empty for the explorer. */
  readonly title: string;
  readonly current: number;
  readonly target: number;
  readonly remaining: number;
  /** Up to 3 missing species (explorer: orders), German and Latin. */
  readonly missing: readonly { readonly latin: string; readonly german: string | null }[];
  /** Catch date of the nth species once reached; `null` while open or unknown. */
  readonly reachedOn: string | null;
}

const MAX_MISSING = 3;
const MAX_OPEN = 4;

function nthDate(dates: readonly (string | null)[], n: number): string | null {
  if (dates.some((d) => d === null)) return null; // one unknown date could be the earlier one (P-08)
  const sorted = (dates as string[]).toSorted();
  return sorted[n - 1] ?? null;
}

interface Spec {
  readonly kind: "family" | "genus";
  readonly group: TreeGroup;
  readonly level: MilestoneLevel;
  readonly target: number;
}

function build({ kind, group, level, target }: Spec, caught: CaughtDates): Milestone {
  const have = group.species.filter((s) => caught.has(s.latin));
  const current = have.length;
  const remaining = Math.max(0, target - current);
  return {
    id: `${kind}:${group.name}:${level}`,
    kind,
    level,
    title: group.german ?? group.name,
    current,
    target,
    remaining,
    missing: group.species
      .filter((s) => !caught.has(s.latin))
      .slice(0, MAX_MISSING)
      .map((s) => ({ latin: s.latin, german: s.german })),
    reachedOn:
      remaining === 0
        ? nthDate(
            have.map((s) => caught.get(s.latin) ?? null),
            target,
          )
        : null,
  };
}

function explorer(orders: readonly TreeGroup[], caught: CaughtDates): Milestone | null {
  if (orders.length === 0) return null;
  const found = orders.filter((o) => o.species.some((s) => caught.has(s.latin)));
  const missing = orders
    .filter((o) => !found.includes(o))
    .toSorted((a, b) => a.species.length - b.species.length || a.name.localeCompare(b.name, "de"))
    .slice(0, MAX_MISSING)
    .map((o) => ({ latin: o.name, german: o.german }));
  const remaining = orders.length - found.length;
  // The explorer is reached with the first catch of the last order: the latest of the earliest dates per order.
  const firsts = found.map((o) =>
    nthDate(
      o.species.filter((s) => caught.has(s.latin)).map((s) => caught.get(s.latin) ?? null),
      1,
    ),
  );
  return {
    id: "explorer",
    kind: "explorer",
    level: "explorer",
    title: "",
    current: found.length,
    target: orders.length,
    remaining,
    missing,
    reachedOn:
      remaining === 0 && firsts.every((d) => d !== null)
        ? ((firsts as string[]).toSorted().at(-1) ?? null)
        : null,
  };
}

export function milestones(tree: MilestoneTree, caught: CaughtDates): Milestone[] {
  const list: Milestone[] = [];
  for (const group of tree.families) {
    const size = group.species.length;
    list.push(build({ kind: "family", group, level: "discovered", target: 1 }, caught));
    if (size >= 3)
      list.push(
        build({ kind: "family", group, level: "connoisseur", target: Math.ceil(size / 2) }, caught),
      );
    if (size >= 2)
      list.push(build({ kind: "family", group, level: "complete", target: size }, caught));
  }
  for (const group of tree.genera) {
    list.push(build({ kind: "genus", group, level: "discovered", target: 1 }, caught));
    if (group.species.length >= 2)
      list.push(
        build({ kind: "genus", group, level: "complete", target: group.species.length }, caught),
      );
  }
  const e = explorer(tree.orders, caught);
  return e ? [...list, e] : list;
}

const ratio = (m: Milestone) => m.current / m.target;

export interface MilestoneOverview {
  /** Up to 4 open milestones, smallest remainder first (tie: higher ratio, then title). */
  readonly open: readonly Milestone[];
  readonly reached: readonly Milestone[];
}

export function milestoneOverview(all: readonly Milestone[]): MilestoneOverview {
  const open = all
    .filter((m) => m.remaining > 0)
    .toSorted(
      (a, b) =>
        a.remaining - b.remaining ||
        ratio(b) - ratio(a) ||
        a.title.localeCompare(b.title, "de") ||
        a.id.localeCompare(b.id),
    );
  return { open: open.slice(0, MAX_OPEN), reached: all.filter((m) => m.remaining === 0) };
}
