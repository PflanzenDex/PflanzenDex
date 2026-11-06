// Types of news-lines.mjs (US-DEV-06, #1486): the changelog file, the fragments and the lines in display order.

export type NewsVersion = { version: string; date: string; lines: string[] };
export type NewsFile = { unreleased: string[]; versions: NewsVersion[] };
/** A fragment file: its name and its line (null when the file has no usable line). */
export type Fragment = { name: string; line: string | null };
/** The heading of a group: the unreleased lines (version null) or a released version with its date. */
export type NewsHeading = { version: null; date: null } | { version: string; date: string };
/** One line in display order; `heading` is set on the first line of each group. */
export type NewsEntry = { text: string; heading: NewsHeading | null };

export const FRAGMENT_DIR: string;
export function isFragmentName(name: string): boolean;
export function orderFragments<T extends { name: string }>(fragments: readonly T[]): T[];
export function fragmentLine(content: string): string | null;
export function germanDate(date: string): string;
export function newsEntries(news: NewsFile, fragments: readonly Fragment[]): NewsEntry[];
export function planRelease(input: {
  news: NewsFile;
  fragments: readonly Fragment[];
  version: string;
  date: string;
}): { news: NewsFile; remove: string[]; lines: string[] };
