// Species names (DM-BES-01): Latin name in normal form and normalization for search and duplicates.

export interface LatinName {
  readonly genus: string;
  readonly epithet: string | null;
  readonly cultivar: string | null;
  /** Display form: "Genus epithet 'Cultivar'". */
  readonly display: string;
}

/**
 * The limits and signs of a catalog name, named once for the rule discovery of the AI interface (US-KI-13, FR-KI-17).
 * The checks below apply them; rule.test.ts proves every limit and sign against the checks, so the words cannot drift.
 */
export const LATIN_NAME_RULE = {
  /** Genus and species epithet; the epithet may be missing (genus only). */
  words: 2,
  /** Letters and hyphens per word. */
  word: { min: 2, max: 40 },
  /** Characters of a cultivar in quotes at the end. */
  cultivar: { min: 1, max: 60 },
  /** Infraspecific additions; they belong to the specimen (DM-BES-02), with or without the dot. */
  additions: ["var", "subvar", "subsp", "ssp", "f", "fo", "forma", "cv"],
  /** Hybrid signs as a word; `+` and `×` also glued to the start of the genus, `×` anywhere in a word. */
  hybridSigns: ["x", "×", "+"],
} as const;

const R = LATIN_NAME_RULE;
// The cultivar appears only in quotation marks at the end (whitespace is already collapsed to one space). `var.`, `subsp.` and `f.` belong to the specimen
// (extra, DM-BES-02) and not in the species name; they cannot be written here.
// The patterns stay literals (no regex built from text, security/detect-non-literal-regexp).
const CULTIVAR = / ['‘"„]([^'’"“”‘„]{1,60})['’"“”]$/u;
const WORD = /^[\p{L}-]{2,40}$/u;

const upperStart = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const wordsValid = (w: string[]) => w.length <= 2 && w.every((x) => WORD.test(x));

const ADDITION = /^(?:var|subvar|subsp|ssp|f|fo|forma|cv)\.?$/iu;
const HYBRID_SIGNS: readonly string[] = R.hybridSigns;

/**
 * Why a text is not a catalog name although it looks like one (US-POK-02): a hybrid sign (`x`, `×`, `+` as a word or
 * glued to the genus) or a `var.`/`subsp.`/`f.`/`cv.` addition. Both belong to the specimen (US-POK-06), not into the
 * catalog. `null` for everything else; an epithet that merely starts with x (`xanthacantha`) is no hybrid sign.
 */
export function latinNameProblem(text: string): "addition" | "hybrid" | null {
  const words = text.split(/\s/u).filter(Boolean);
  if (words.some((w) => ADDITION.test(w))) return "addition";
  const glued = /^[×+]/u.test(words[0] ?? "") || words.some((w) => w.includes("×"));
  return glued || words.some((w) => HYBRID_SIGNS.includes(w.toLowerCase())) ? "hybrid" : null;
}

/** Splits a Latin name; `null` if it does not match the pattern. */
export function parseLatin(text: string): LatinName | null {
  // Collapse whitespace to single spaces first (linear, no `\s+` regex on user input).
  let rest = text.split(/\s/u).filter(Boolean).join(" ");
  const cultivar = CULTIVAR.exec(rest)?.[1]?.trim() || null;
  if (cultivar) rest = rest.replace(CULTIVAR, "");
  const words = rest.split(" ");
  const [g, e] = words;
  if (!wordsValid(words) || !g) return null;
  const genus = upperStart(g);
  const epithet = e ? e.toLowerCase() : null;
  const display = [genus, epithet, cultivar && `'${cultivar}'`].filter(Boolean).join(" ");
  return { genus, epithet, cultivar, display };
}

/** Lowercase, no accents, ß as ss, punctuation like spaces: equal names yield the same key. */
export function normalize(text: string): string {
  return text
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
