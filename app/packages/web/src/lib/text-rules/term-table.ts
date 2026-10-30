/**
 * The term table of the German UI (US-QS-24): one UI word per concept. `retired` are the words that no longer
 * appear in a UI text; `retired-words.test.ts` fails when one does. The table with the reasons is in
 * `docs/specs/product/14-cross-cutting.md` (US-QS-24).
 */
export const RETIRED_WORDS: ReadonlyArray<{ concept: string; use: string; pattern: RegExp }> = [
  { concept: "Collection", use: "Sammlung", pattern: /\b(?:Bestand|Bestands)\b/ },
  {
    concept: "Specimen",
    use: "Pflanze",
    pattern: /\b(?:Exemplaren|Exemplare|Exemplars|Exemplar)\b/,
  },
  { concept: "Wishlist", use: "Wunschliste", pattern: /\bWunschzettel\b|\bWunsch-Liste\b/ },
  { concept: "Light zone 1", use: "Stecklingslicht", pattern: /\bLampe 1\b/ },
];

/**
 * Files that may keep a retired word, each with the reason. Add a row only for a quoted prototype or legal text
 * or for a file another open PR is changing; never to turn the test green.
 */
export const EXCEPTIONS: ReadonlyArray<{ file: RegExp; reason: string }> = [
  {
    file: /(^|\/)lib\/text-rules\//,
    reason: "the term table and its test name the retired words on purpose",
  },
  {
    file: /(^|\/)news\/news\.de\.json$/,
    reason: "dated release notes are history and are not rewritten",
  },
  {
    file: /(^|\/)social\/pages\/friends-page\//,
    reason: "being changed in PR #964; the term table is applied there as a follow-up",
  },
];

/** Three dots in a text where the ellipsis character belongs (US-QS-24); a spread `...x` is code and not matched. */
export const THREE_DOTS = /[\p{L}\d] ?\.\.\.(?![\p{L}\d.{([$_,)\]}])/u;
