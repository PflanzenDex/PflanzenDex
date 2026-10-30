import {
  attributesOf,
  sourcesOf,
  type AttributeFact,
  type AttributeSource,
  type SuggestionAttributes,
} from "./attributes";

/**
 * Adds the stored facts with their sources to the cards (one read for all of them); a card without a fact keeps its
 * unknown attributes and gets no source (P-08). Without a source port every attribute stays unknown.
 */
export async function withAttributes<
  S extends {
    readonly species: string;
    readonly attributes: SuggestionAttributes;
    readonly attributeSources?: readonly AttributeSource[];
  },
>(
  cards: readonly S[],
  source: { forSpecies(names: readonly string[]): Promise<readonly AttributeFact[]> } | undefined,
): Promise<S[]> {
  if (source === undefined || cards.length === 0) return [...cards];
  const facts = await source.forSpecies(cards.map((c) => c.species));
  return cards.map((c) => {
    const own = facts.filter((f) => f.species === c.species);
    return own.length === 0
      ? c
      : { ...c, attributes: attributesOf(own), attributeSources: sourcesOf(own) };
  });
}
