/** The letters of the strip, then "#" for every name that does not start with a letter (SG-LIST-11, issue 2419). */
export const LETTERS: readonly string[] = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

/** The strip shows from this many rows on: a shorter list is quicker to scroll than to jump through (starting value, assumption). */
export const MIN_ROWS = 100;

/**
 * The letter a name is filed under: its first character without accents and upper case ("Ägerling" is under A), or "#"
 * where that is no letter A to Z (a digit, a quote, an empty name). The list is ordered by the same name (`localeCompare`
 * in German), so the first entry of a letter is the first one that has it.
 */
export function letterOf(name: string): string {
  const first = name.trim().normalize("NFD").charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

/**
 * The first entry of each letter, by its index in the list: only the letters that have an entry are keys. A letter without an
 * entry is dimmed on the strip and a jump to it goes on to the next letter that has one.
 */
export function firstIndexes(names: readonly string[]): ReadonlyMap<string, number> {
  const first = new Map<string, number>();
  names.forEach((name, index) => {
    const letter = letterOf(name);
    if (!first.has(letter)) first.set(letter, index);
  });
  return first;
}

/**
 * The letter a touch on the strip lands on: the one at `share` (0 at the top, 1 at the bottom) of the strip when it has
 * entries, else the next one that has some, else the last one before it. `undefined` without any entry.
 */
export function letterAt(share: number, present: ReadonlySet<string>): string | undefined {
  const at = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(share * LETTERS.length)));
  const after = LETTERS.slice(at).find((letter) => present.has(letter));
  return (
    after ??
    LETTERS.slice(0, at)
      .reverse()
      .find((letter) => present.has(letter))
  );
}
