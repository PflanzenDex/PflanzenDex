import news from "@/news/news.de.json";
import { readStored, writeStored } from "@/shared/platform/browser/storage";

/**
 * The user-facing changelog, newest first: every `feat:` and `fix:` PR adds its line at the top of `unreleased`
 * (QG-U3, US-DEV-06). Only lazy parts import this module (the page Neu and the hint on "Heute"), so the lines stay out
 * of the first load (DS-08).
 */
export const NEWS_LINES: readonly string[] = news.unreleased;

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
 * `total - seen`. A stored count above `total` means that a release has cut the list: every line left is new then.
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
