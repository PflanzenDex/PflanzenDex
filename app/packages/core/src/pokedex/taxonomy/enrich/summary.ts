export const SUMMARY_LIMITS = { sentences: 2, characters: 240 } as const;

/** A full stop, "!" or "?" followed by a capital letter or an opening quote ends a sentence ("L. ist" does not). */
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-ZÄÖÜ"„])/;

/**
 * Short text of a Wikipedia extract: at most 2 sentences and 240 characters, cut at a sentence boundary. If even the
 * first sentence is longer, there is no short text (`null` = unknown) rather than a cut-off one (P-08).
 */
export function shortText(extract: string): string | null {
  const sentences = extract.replace(/\s+/g, " ").trim().split(SENTENCE_END);
  let taken = sentences.slice(0, SUMMARY_LIMITS.sentences);
  while (taken.length > 0 && taken.join(" ").length > SUMMARY_LIMITS.characters)
    taken = taken.slice(0, -1);
  return taken.length > 0 ? taken.join(" ") : null;
}
