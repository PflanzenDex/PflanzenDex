// Suggestions (US-ENT-01): the species of the catalog tree that the keeper neither owns nor has a wish for, ordered
// by the shares they have (space, new family; US-ENT-03, FR-ENT-02), then the tree order (FR-ENT-05: same data, same
// deck, same order). Reasons name own data only and carry no percentage (FR-ENT-06, P-08).
import { pokedexOwnership, readCollectorCards, type CollectorCard } from "../../pokedex";
import { REPLENISH_BUFFER, wishNameKey, type ZoneStock } from "../../wishlist";
import {
  preferenceFactor,
  preferenceReason,
  tallyOf,
  type Decisions,
  type Tally,
} from "../preferences";
import { localToday } from "../../kernel";
import { explorationPlan } from "../exploration";
import {
  EXPLORATION_PER_DECK,
  type Suggestion,
  type SuggestionDeck,
  type SuggestionOptions,
  type SuggestionsDependencies,
  type ZoneFilter,
} from "./types";
import { EMPTY_CATALOG, exploringDeckOf } from "./deck";

/** At most 3 reasons are shown (US-ENT-03). */
const MAX_REASONS = 3;

/**
 * The space share of FR-ENT-02 (US-LIC-02): the zone of the species is the zone with the fewest plants of the account.
 * Zone number n is the n-th zone of the account (zone 1 is the cutting light; `stock` holds zones 2 to 4 in order). An
 * unknown zone, a tie of all zones and an account without a counted plant give no reason (P-08, FR-ENT-04).
 */
function spaceReason(zone: number | null, stock: readonly ZoneStock[]): string | null {
  const own = zone === null ? undefined : stock[zone - 2];
  if (!own || stock.every((z) => z.count === stock[0]?.count)) return null;
  if (own.count !== Math.min(...stock.map((z) => z.count))) return null;
  return own.count === 0
    ? `In ${own.name} steht noch keine Pflanze.`
    : `${own.name} hat die wenigsten Pflanzen (${own.count}).`;
}

interface Shares {
  /** The reasons in the order of their strength; the plain "not caught" fact comes last and is no share. */
  readonly reasons: string[];
  /** Number of scoring shares (FR-ENT-02, every share weighs 1: starting value, assumption). */
  readonly score: number;
}

function sharesOf(
  card: CollectorCard,
  newFamily: boolean,
  stock: readonly ZoneStock[],
  tally: Tally,
): Shares {
  const reasons: string[] = [];
  const space = spaceReason(card.lightZone, stock);
  if (space) reasons.push(space);
  if (newFamily && card.family !== null)
    reasons.push(`Neue Familie: ${card.family} fehlt dir noch im Pokédex.`);
  const score = reasons.length;
  // The preference is a factor, not a share (FR-ENT-02): it names the own wishes it comes from (US-ENT-05).
  const preferred = preferenceReason(tally, card);
  if (preferred) reasons.push(preferred);
  reasons.push("Diese Art hast du noch nicht gefangen.");
  return { reasons: reasons.slice(0, MAX_REASONS), score };
}

function suggestionOf(card: CollectorCard, reasons: readonly string[]): Suggestion {
  return {
    species: card.species,
    germanName: card.germanName,
    summary: card.summary,
    summaryLanguage: card.summaryLanguage,
    family: card.family,
    lightZone: card.lightZone,
    difficulty: card.difficulty,
    imageUrl: card.imageUrl,
    sourceUrl: card.sourceUrl,
    attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
    reasons,
    exploration: false,
  };
}

/**
 * Pure: the ordered candidates of the account; a species with a wish of any status is excluded (US-ENT-02 reads on).
 * Order: the score of FR-ENT-02 first, the tree order inside a group (FR-ENT-05). The score is the preference factor
 * (US-ENT-05) times the shares (space, new family) plus a base of 1 (assumption, decided by the PO, so that the
 * factor also orders species without a share); without decisions the factor is 1 and the order is that of the shares.
 */
export function candidatesOf(
  cards: readonly CollectorCard[],
  wishedNames: readonly string[],
  stock: readonly ZoneStock[] = [],
  decisions: Decisions = { yes: [], no: [] },
): Suggestion[] {
  const tally = tallyOf(cards, decisions);
  const wished = new Set(wishedNames.map(wishNameKey));
  const owned = new Set(cards.filter((c) => c.state === "caught").map((c) => c.family));
  const open = cards.filter((c) => c.state === "missing" && !wished.has(wishNameKey(c.species)));
  const fresh = (c: CollectorCard) => c.family !== null && !owned.has(c.family);
  const scored = open.map((c) => {
    const shares = sharesOf(c, fresh(c), stock, tally);
    return { c, reasons: shares.reasons, rank: preferenceFactor(tally, c) * (1 + shares.score) };
  });
  // Array.prototype.sort is stable, so the tree order stays inside equal scores.
  return scored.sort((a, b) => b.rank - a.rank).map(({ c, reasons }) => suggestionOf(c, reasons));
}

/** The ordered candidates of the account with the zone stock and the wished names they were derived from (P-04). */
export async function candidatesFor(
  deps: SuggestionsDependencies,
  userId: string,
  timeZone: string,
) {
  const { caught } = await pokedexOwnership(deps.ownership, userId, timeZone);
  const [cards, open, bought, discarded, stock] = await Promise.all([
    readCollectorCards(deps.tree, userId, caught),
    deps.wishes.open(userId),
    deps.wishes.bought(userId),
    deps.wishes.discarded(userId),
    deps.stock?.stock(userId) ?? [],
  ]);
  const names = [...open, ...bought, ...discarded].map((w) => w.name);
  // US-ENT-05: yes = open and bought wishes, no = discarded wishes, derived live on every deck.
  const decisions = {
    yes: [...open, ...bought].map((w) => w.name),
    no: discarded.map((w) => w.name),
  };
  return {
    catalogEmpty: cards.length === 0,
    cards,
    names,
    stock,
    candidates: candidatesOf(cards, names, stock, decisions),
  };
}

/**
 * The zone filter of US-ENT-07: how many candidates the zone has and whether that is fewer than the buffer of the
 * account (US-WUN-02), then the way on is the proposal of a species (P-09). Without a stock the zone has no name.
 */
function zoneFilterOf(
  zone: number,
  available: number,
  buffer: number,
  stock: readonly ZoneStock[],
): ZoneFilter {
  const name = stock[zone - 2]?.name ?? null;
  const label = name ?? `Zone ${zone}`;
  const short = available < buffer;
  return {
    zone,
    name,
    available,
    shortfall: short
      ? {
          text: `Für ${label} gibt es im Katalog nur ${available} passende ${available === 1 ? "Art" : "Arten"} (Puffer: ${buffer}).`,
          nextAction:
            "Du kannst eine neue Art für den Katalog vorschlagen (Katalog, „Art vorschlagen“).",
        }
      : null,
  };
}

/**
 * Reads the suggestions of the account (P-04): ownership is derived live, the wishes are the only decisions so far.
 * With `options.zone` the deck holds only species of that light zone (US-ENT-07); the exploration picks of other zones
 * are left out, and the answer says whether the zone has fewer candidates than the buffer.
 */
export async function suggestions(
  deps: SuggestionsDependencies,
  userId: string,
  timeZone: string,
  options: SuggestionOptions = {},
): Promise<SuggestionDeck> {
  const { zone, deck = 1 } = options;
  const { catalogEmpty, candidates, cards, names, stock } = await candidatesFor(
    deps,
    userId,
    timeZone,
  );
  if (catalogEmpty) return { deck, suggestions: [], empty: EMPTY_CATALOG, zoneFilter: null };
  const inZone = zone === undefined ? candidates : candidates.filter((c) => c.lightZone === zone);
  // The picks are fixed per account and local day (FR-ENT-05); the deck number is part of the choice inside a group.
  const seed = `${userId}|${localToday((deps.clock ?? (() => new Date()))(), timeZone)}`;
  const plan = explorationPlan(cards, names, seed, EXPLORATION_PER_DECK).map((picks) =>
    zone === undefined ? picks : picks.filter((p) => p.card.lightZone === zone),
  );
  const result = exploringDeckOf(inZone, plan, deck);
  if (zone === undefined) return result;
  const buffer = (await deps.stock?.buffer?.(userId)) ?? REPLENISH_BUFFER;
  return { ...result, zoneFilter: zoneFilterOf(zone, inZone.length, buffer, stock) };
}
