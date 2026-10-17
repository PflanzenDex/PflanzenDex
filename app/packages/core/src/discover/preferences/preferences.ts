// Preferences (US-ENT-05): derived live from the own wishes on every deck and never stored (NFR-04, P-01). Every wish
// with the status wishlist or bought counts as "yes", every discarded one as "no", whatever its source: a wish from AI
// research or entered by hand was adopted deliberately. Only the own decisions count (FR-ENT-07, P-05).
import type { CollectorCard } from "../../pokedex";
import { wishNameKey } from "../../wishlist";

/** Names of the own wishes: yes = open and bought wishes, no = discarded wishes. */
export interface Decisions {
  readonly yes: readonly string[];
  readonly no: readonly string[];
}

/** The attributes the factor looks at: those the catalog carries (DM-ENT-01 attributes join as soon as it has them). */
type Attribute = "family" | "genus" | "lightZone" | "difficulty";

interface Count {
  yes: number;
  no: number;
}
/** Per attribute and value the number of yes and no decisions. */
export type Tally = ReadonlyMap<string, Count>;

const keyOf = (attribute: Attribute, value: string | number) => `${attribute}:${value}`;

/** The known values of a card as `[attribute, value]`; an unknown value is left out, so it stays neutral (FR-ENT-04). */
function valuesOf(card: CollectorCard): [Attribute, string | number][] {
  const all: [Attribute, string | number | null][] = [
    ["family", card.family],
    ["genus", card.genus],
    ["lightZone", card.lightZone],
    ["difficulty", card.difficulty],
  ];
  return all.filter((e): e is [Attribute, string | number] => e[1] !== null && e[1] !== "");
}

/**
 * Pure: counts the decisions per attribute value. A decision is attributed through the catalog card with the same name
 * key; a wish for a species outside the catalog has no known attributes and changes nothing (P-08).
 * Assumption, decided by the PO: the light zone and the difficulty count as the catalog states them, not as typed into the wish.
 */
export function tallyOf(cards: readonly CollectorCard[], decisions: Decisions): Tally {
  const byName = new Map(cards.map((c) => [wishNameKey(c.species), c]));
  const tally = new Map<string, Count>();
  const add = (names: readonly string[], side: keyof Count) => {
    for (const name of names) {
      const card = byName.get(wishNameKey(name));
      if (!card) continue;
      for (const [attribute, value] of valuesOf(card)) {
        const key = keyOf(attribute, value);
        const count = tally.get(key) ?? { yes: 0, no: 0 };
        count[side] += 1;
        tally.set(key, count);
      }
    }
  };
  add(decisions.yes, "yes");
  add(decisions.no, "no");
  return tally;
}

const countOf = (tally: Tally, attribute: Attribute, value: string | number | null): Count =>
  (value === null ? undefined : tally.get(keyOf(attribute, value))) ?? { yes: 0, no: 0 };

/**
 * Pure: the preference factor of a candidate, the product of `(yes + 1) / (no + 1)` over its known attribute values
 * (US-ENT-05). Without decisions it is 1. It only orders; it is shown as a reason, never as a percentage (FR-ENT-06).
 */
export function preferenceFactor(tally: Tally, card: CollectorCard): number {
  return valuesOf(card).reduce((product, [attribute, value]) => {
    const { yes, no } = countOf(tally, attribute, value);
    return product * ((yes + 1) / (no + 1));
  }, 1);
}

/**
 * The reason "you put n species of this genus (family) on the wishlist" (US-ENT-03, US-ENT-05) for the most specific
 * level where the keeper said Yes more often than No; `null` if there is none (P-08: only what can be proven).
 */
export function preferenceReason(tally: Tally, card: CollectorCard): string | null {
  const genus = countOf(tally, "genus", card.genus);
  if (genus.yes > genus.no)
    return `Du hast ${genus.yes} ${genus.yes === 1 ? "Art" : "Arten"} der Gattung ${card.genus} auf der Wunschliste.`;
  const family = countOf(tally, "family", card.family);
  if (card.family !== null && family.yes > family.no)
    return `Du hast ${family.yes} ${family.yes === 1 ? "Art" : "Arten"} der Familie ${card.family} auf der Wunschliste.`;
  return null;
}
