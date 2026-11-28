/** A search filters from this many characters (SG-SEARCH-01, starting value). */
export const MIN_QUERY = 2;

/** The text of a search or a name for the comparison: without the space around it, in lower case of German. */
export const normal = (text: string): string => text.trim().toLocaleLowerCase("de-DE");

/** The entries whose name holds the query; a query shorter than `MIN_QUERY` shows every entry. */
export function matching<T extends { name: string }>(entries: readonly T[], query: string): T[] {
  const q = normal(query);
  if (q.length < MIN_QUERY) return [...entries];
  return entries.filter((e) => normal(e.name).includes(q));
}
