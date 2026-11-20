/**
 * Message tables (FR-QG-26, ADR 0004): every UI text of a feature lives in `<feature>/<feature>.de.json`, a flat
 * object of keys and German texts. `texts(table)` returns a reader that only accepts the table's keys and fills
 * `{name}` placeholders. A placeholder without a value throws (P-10): a half-filled text never reaches the screen.
 */
export type TextTable = Readonly<Record<string, string>>;
export type TextValues = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;
/** The no-break space of counts and units (SG-TYPE-07); format.ts re-exports it. */
export const NBSP = "\u00a0";

function fill(key: string, text: string, values: TextValues): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`UI text "${key}" needs a value for {${name}}`);
    return String(value);
  });
}

export function texts<T extends TextTable>(table: T) {
  return (key: keyof T & string, values: TextValues = {}): string => {
    const text = table[key];
    if (text === undefined) throw new Error(`UI text "${key}" is missing in its table`);
    return fill(key, text, values);
  };
}

/** The base key of each `<key>.one` / `<key>.other` pair: "tiles.treatments" for "tiles.treatments.one". */
export type PluralKey<T> = {
  [K in keyof T & string]: K extends `${infer Base}.one` ? Base : never;
}[keyof T & string];

/**
 * The plural forms of a count (US-QS-32, SG-FMT-03): `<key>.one` for 1 and `<key>.other` for every other count, zero
 * included; a count that is still loading (`undefined`) reads as the plural. `word` gives the word alone, for a count
 * shown beside it; `counted` gives the number with its text, and the space after `{count}` is a no-break space, so
 * the number never breaks from its word (SG-TYPE-07).
 */
export function plurals<T extends TextTable>(table: T) {
  const form = (key: string, count: number | undefined): string => {
    const name = `${key}.${count === 1 ? "one" : "other"}`;
    const text = table[name];
    if (text === undefined) throw new Error(`UI text "${name}" is missing in its table`);
    return text;
  };
  return {
    word: (key: PluralKey<T>, count: number | undefined): string => form(key, count),
    counted: (key: PluralKey<T>, count: number): string =>
      fill(key, form(key, count).replace("{count} ", `{count}${NBSP}`), { count }),
  };
}
