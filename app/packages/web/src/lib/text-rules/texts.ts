/**
 * Message tables (FR-QG-26, ADR 0004): every UI text of a feature lives in `<feature>/<feature>.de.json`, a flat
 * object of keys and German texts. `texts(table)` returns a reader that only accepts the table's keys and fills
 * `{name}` placeholders. A placeholder without a value throws (P-10): a half-filled text never reaches the screen.
 */
export type TextTable = Readonly<Record<string, string>>;
export type TextValues = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function texts<T extends TextTable>(table: T) {
  return (key: keyof T & string, values: TextValues = {}): string => {
    const text = table[key];
    if (text === undefined) throw new Error(`UI text "${key}" is missing in its table`);
    return text.replace(PLACEHOLDER, (_, name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`UI text "${key}" needs a value for {${name}}`);
      return String(value);
    });
  };
}
