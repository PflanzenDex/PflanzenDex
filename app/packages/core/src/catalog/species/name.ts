// Species names (DM-BES-01): Latin name in normal form and normalization for search and duplicates.

export interface LatinName {
  readonly genus: string;
  readonly epithet: string | null;
  readonly cultivar: string | null;
  /** Anzeigeform: „Gattung epitheton 'Sorte'“. */
  readonly display: string;
}

// The cultivar appears only in quotation marks at the end (whitespace is already collapsed to one space). `var.`, `subsp.` and `f.` belong to the specimen
// (extra, DM-BES-02) and not in the species name; they cannot be written here.
const CULTIVAR = / ['‘"„]([^'’"“”‘„]{1,60})['’"“”]$/u;
const WORD = /^[\p{L}-]{2,40}$/u;

const upperStart = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const wordsValid = (w: string[]) => w.length <= 2 && w.every((x) => WORD.test(x));

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
