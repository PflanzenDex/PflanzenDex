import type { SharedSpecimen } from "../types";
import { friendView, type FriendViewDependencies } from "./view";
import type { OwnSpeciesNames } from "./shared-species";

/**
 * One card of a friend's shared collection (US-SOZ-07): a species the friend shares, with how many specimens and since
 * when. `iHave` compares with my own collection: `true` "du hast sie", `false` "du hast sie nicht", `null` unknown (the
 * species is unknown to friends, so it cannot be compared, P-08). Facts only: no rank, no rating (FR-SOZ-11).
 */
export interface FriendCard {
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  /** Shared specimens of this species, cuttings included. */
  readonly specimens: number;
  readonly cuttings: number;
  /** Earliest known catch date among them (calendar date); `null` = unknown (P-08). */
  readonly firstCaught: string | null;
  readonly iHave: boolean | null;
}

const byName = (a: FriendCard, b: FriendCard) =>
  Number(a.speciesLatin === null) - Number(b.speciesLatin === null) ||
  (a.speciesLatin ?? "").localeCompare(b.speciesLatin ?? "");

/** Adds one shared specimen to the card of its species. */
function add(
  card: FriendCard | undefined,
  s: SharedSpecimen,
  mine: ReadonlySet<string>,
): FriendCard {
  const dates = [card?.firstCaught ?? null, s.caughtAt].filter((d): d is string => d !== null);
  return {
    speciesLatin: s.speciesLatin,
    speciesGerman: s.speciesGerman,
    specimens: (card?.specimens ?? 0) + 1,
    cuttings: (card?.cuttings ?? 0) + (s.isCutting ? 1 : 0),
    firstCaught: dates.sort()[0] ?? null,
    iHave: s.speciesLatin === null ? null : mine.has(s.speciesLatin),
  };
}

/**
 * The shared collection of a friend as cards (US-SOZ-07, P-05): derived from `friendView`, so only through a confirmed
 * friendship, only what the friend shares, nothing while "Everything private" is on. "Caught" means: the friend shares an
 * active specimen of the species. Species the friend shares without a name known to friends stay separate cards and are not compared.
 */
export async function friendCollection(
  deps: FriendViewDependencies & { readonly mine: OwnSpeciesNames },
  viewerId: string,
  ownerId: string,
): Promise<{ readonly cards: readonly FriendCard[] }> {
  const { specimens } = await friendView(deps, viewerId, ownerId);
  const mine = new Set(await deps.mine.latinNamesOf(viewerId));
  const groups = new Map<string, FriendCard>();
  for (const s of specimens) {
    const key = s.speciesLatin ?? s.id;
    groups.set(key, add(groups.get(key), s, mine));
  }
  return { cards: [...groups.values()].sort(byName) };
}
