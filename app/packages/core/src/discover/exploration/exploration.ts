// Exploration (US-ENT-06): now and then a species from outside the pattern, so that the catalog does not shrink to one
// corner. Species of orders or families without a caught species, the group with the fewest species first (like the
// Explorer milestone, US-POK-11). Pure and deterministic: the same account, day and deck number give the same picks
// (FR-ENT-05). Nothing is stored (P-01).
import type { CollectorCard } from "../../pokedex";
import { wishNameKey } from "../../wishlist";

export interface ExplorationPick {
  readonly card: CollectorCard;
  /** Why it is shown: the own Pokédex has no species of that group (P-08: provable). */
  readonly reason: string;
}

interface Group {
  readonly key: string;
  readonly reason: string;
  /** Species of the whole catalog tree in this group: the smaller the group, the earlier it comes. */
  readonly size: number;
  readonly open: CollectorCard[];
}

/** FNV-1a, 32 bit: a small stable hash, no randomness (FR-ENT-05). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * The group a species explores: its order if the account has no caught species there, else its family if the account
 * has none in the family; `null` if both are known to be covered or unknown (P-08).
 */
function groupOf(
  c: CollectorCard,
  caught: { orders: ReadonlySet<string>; families: ReadonlySet<string> },
): Pick<Group, "key" | "reason"> | null {
  if (c.order !== null && !caught.orders.has(c.order))
    return {
      key: `order:${c.order}`,
      reason: `Aus der Ordnung ${c.order} hast du noch keine Art im Pokédex.`,
    };
  if (c.family !== null && !caught.families.has(c.family))
    return {
      key: `family:${c.family}`,
      reason: `Aus der Familie ${c.family} hast du noch keine Art im Pokédex.`,
    };
  return null;
}

function groupsOf(cards: readonly CollectorCard[], wishedNames: readonly string[]): Group[] {
  const wished = new Set(wishedNames.map(wishNameKey));
  const owned = cards.filter((c) => c.state === "caught");
  const caught = {
    orders: new Set(owned.flatMap((c) => (c.order === null ? [] : [c.order]))),
    families: new Set(owned.flatMap((c) => (c.family === null ? [] : [c.family]))),
  };
  const groups = new Map<string, Group>();
  for (const c of cards) {
    const g = groupOf(c, caught);
    if (!g) continue;
    const group = groups.get(g.key) ?? { ...g, size: 0, open: [] };
    group.open.push(...(c.state === "missing" && !wished.has(wishNameKey(c.species)) ? [c] : []));
    groups.set(g.key, { ...group, size: group.size + 1 });
  }
  // Fewest species first, the name breaks ties (FR-ENT-05); a group without an open species gives nothing to show.
  return [...groups.values()]
    .filter((g) => g.open.length > 0)
    .sort((a, b) => a.size - b.size || a.key.localeCompare(b.key, "de"));
}

/**
 * The exploration picks of every deck: deck n takes one species from each of the next `count` groups, so the groups of
 * the earlier decks are used up first. Inside a group the species is chosen by a stable hash of `seed` (account and
 * local day), the deck number and the group, so the choice varies from day to day but a reload shows the same deck. The
 * hard filters of US-ENT-02 apply here too as soon as they exist.
 */
export function explorationPlan(
  cards: readonly CollectorCard[],
  wishedNames: readonly string[],
  seed: string,
  count: number,
): ExplorationPick[][] {
  const groups = groupsOf(cards, wishedNames);
  const decks: ExplorationPick[][] = [];
  for (let i = 0; i < groups.length; i += count)
    decks.push(
      groups.slice(i, i + count).map((g) => ({
        card: g.open[hash(`${seed}|${decks.length + 1}|${g.key}`) % g.open.length] as CollectorCard,
        reason: g.reason,
      })),
    );
  return decks;
}
