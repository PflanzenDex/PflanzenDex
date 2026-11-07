// The taxonomy tree as the progress reads it (US-POK-10, US-POK-11): one row per species of the tree with its family,
// genus and order and the German name of the approved catalog. `GET /pokedex/tree` answers these rows; the rank totals
// and the milestone groups are derived from them on demand, never stored (P-01). Unknown values stay `null` (P-08).
import { shortGermanName, type SpeciesFacts, type TaxonCardRow } from "../cards";
import type { MilestoneTree, TreeGroup, TreeSpecies } from "../milestones";
import type { TreeTotals } from "./rank";

/** One species of the tree; `null` = unknown (P-08). `german` is the short German name (US-POK-09). */
export interface TreeRow {
  readonly latin: string;
  readonly german: string | null;
  readonly family: string | null;
  readonly genus: string;
  readonly order: string | null;
}

/** The tree as `GET /pokedex/tree` answers it; `null` before the first taxonomy build. */
export interface PokedexTree {
  readonly species: readonly TreeRow[];
}

const byLatin = (a: { readonly latin: string }, b: { readonly latin: string }) =>
  a.latin.localeCompare(b.latin, "de");

/**
 * The tree rows of the account's progress: the built tree with the German name of each species (the first approved
 * fact wins, as for the collector cards). Sorted by Latin name, so every read answers alike (US-POK-11).
 */
export function pokedexTreeOf(
  species: readonly TaxonCardRow[] | null,
  facts: readonly SpeciesFacts[],
): PokedexTree | null {
  if (species === null) return null;
  const german = new Map<string, string | null>();
  for (const f of facts) {
    if (!german.has(f.latinName)) german.set(f.latinName, shortGermanName(f.germanName));
  }
  return {
    species: species
      .map((t) => ({
        latin: t.latinName,
        german: german.get(t.latinName) ?? null,
        family: t.family,
        genus: t.genus,
        order: t.order,
      }))
      .toSorted(byLatin),
  };
}

/**
 * The totals of the collector rank (US-POK-10): every species of the tree, the caught species that are in the tree (the
 * count the rank and "N / M" use, so a caught species outside the tree never lifts the percentage above 100), the distinct
 * orders of the tree and the orders with a caught species. A species without order counts as a species but not as an
 * order, as the milestones do. A Latin name that the tree holds twice counts once.
 */
export function treeTotalsOf(rows: readonly TreeRow[], caught: ReadonlySet<string>): TreeTotals {
  const species = new Map(rows.map((r) => [r.latin, r] as const));
  const orders = new Set<string>();
  const discovered = new Set<string>();
  let speciesCaught = 0;
  for (const r of species.values()) {
    const isCaught = caught.has(r.latin);
    if (isCaught) speciesCaught += 1;
    if (r.order === null) continue;
    orders.add(r.order);
    if (isCaught) discovered.add(r.order);
  }
  return {
    speciesTotal: species.size,
    speciesCaught,
    orderTotal: orders.size,
    ordersDiscovered: discovered.size,
  };
}

/**
 * The groups the milestones count (US-POK-11): the families, genera and orders of the tree, each with its species. A
 * group has no German name of its own (the tree holds none), so its title is the Latin name. A species without family
 * or order is in no such group, so it has no milestone of that kind.
 */
export function milestoneTreeOf(rows: readonly TreeRow[]): MilestoneTree {
  return {
    families: groupsOf(rows, (r) => r.family),
    genera: groupsOf(rows, (r) => r.genus),
    orders: groupsOf(rows, (r) => r.order),
  };
}

function groupsOf(rows: readonly TreeRow[], key: (r: TreeRow) => string | null): TreeGroup[] {
  const groups = new Map<string, TreeSpecies[]>();
  for (const r of rows) {
    const name = key(r);
    if (name === null) continue;
    const members = groups.get(name) ?? [];
    members.push({ latin: r.latin, german: r.german });
    groups.set(name, members);
  }
  return [...groups]
    .map(([name, species]) => ({ name, german: null, species: species.toSorted(byLatin) }))
    .toSorted((a, b) => a.name.localeCompare(b.name, "de"));
}
