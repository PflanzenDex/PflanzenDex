import news from "@/news/news.de.json";
import { newsEntries, type NewsEntry } from "./news-lines.mjs";
import { readStored, writeStored } from "@/shared/platform/browser/storage";

/**
 * One fragment per `feat:` and `fix:` PR (QG-U3, US-DEV-06): a JSON file in news/unreleased/, read here with the other
 * changelog lines. Only lazy parts import this module (the page Neu and the hint on "Heute"), so the lines stay out of
 * the first load (DS-08).
 */
const fragmentModules = import.meta.glob<{ default: { line?: unknown } }>(
  "../../../../news/unreleased/*.json",
  { eager: true },
);
const fragments = Object.entries(fragmentModules).map(([path, mod]) => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  line: typeof mod.default.line === "string" ? mod.default.line : null,
}));

/** The changelog lines in display order: the unreleased lines first, then each version with its heading (US-DEV-06). */
export const NEWS_ENTRIES: readonly NewsEntry[] = newsEntries(news, fragments);

/**
 * The number of lines. A release moves lines from the unreleased part into a version and the count stays the same, so a
 * moved line is not new (US-DEV-06).
 */
export const NEWS_COUNT = NEWS_ENTRIES.length;

/** The per-device key of the number of lines the keeper has seen (DS-10). */
const SEEN_KEY = "pflanzendex.news-seen";

/** The version of this build from `VITE_APP_VERSION` (set by the web image), `undefined` in local development. */
export function appVersion(): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"] || undefined;
}

/** The number of lines seen on this device; `null` when nothing is stored, or when the stored value is no count. */
function storedSeen(): number | null {
  const raw = readStored(SEEN_KEY);
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Records that the first `total` lines are seen. `false` when storage is unavailable. */
export function markNewsSeen(total: number): boolean {
  return writeStored(SEEN_KEY, String(total));
}

/**
 * The lines not seen yet, given the stored count (US-DEV-06). Lines are only prepended, so the unseen ones are the first
 * `total - seen`. A release keeps the count (it moves lines, see NEWS_COUNT). A stored count above `total` means that
 * lines were taken back: every line left is shown as new then, so nothing is missed.
 */
export function unseenOf(total: number, seen: number): number {
  return seen > total ? total : total - seen;
}

/**
 * The lines this device has not seen, checked when "Heute" opens (US-DEV-06). Nothing stored is a first visit: nothing is
 * unseen and the current count is recorded, so a new keeper does not get the old lines. Storage that cannot be read or
 * written counts as nothing unseen as well, so the hint never comes back on every visit. The price: a device without
 * storage never sees the hint.
 */
export function unseenNow(total: number): number {
  const seen = storedSeen();
  if (seen === null) {
    markNewsSeen(total);
    return 0;
  }
  return unseenOf(total, seen);
}
