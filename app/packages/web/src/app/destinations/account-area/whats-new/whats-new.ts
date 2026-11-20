import news from "@/news/news.de.json";
import { newsEntries, type NewsEntry } from "./news-lines.mjs";
import { capSeen, lineKey, parseKeys } from "./news-keys";
import {
  readSessionStored,
  readStored,
  removeStored,
  writeSessionStored,
  writeStored,
} from "@/shared/platform/browser/storage";

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

/** Each line with its key, in display order. */
const KEYED = NEWS_ENTRIES.map((entry) => ({ entry, key: lineKey(entry.text) }));
/** The keys of all lines, in display order. */
const ALL_KEYS: readonly string[] = KEYED.map((item) => item.key);

/** The per-device key of the line keys the keeper has seen (US-QS-27, DS-10). */
const SEEN_KEY = "pflanzendex.news-seen-lines";
/** The key of the count of the rule before (US-DEV-06): read once to migrate the seen state, then removed. */
const LEGACY_SEEN_KEY = "pflanzendex.news-seen";
/** The keys of the lines the banner showed and that have not ended yet (US-QS-27). */
const PENDING_KEY = "pflanzendex.news-banner-pending";
/** Set in the browser tab's session once the banner has shown (US-QS-27). */
const SESSION_KEY = "pflanzendex.news-banner-session";

/** The version of this build from `VITE_APP_VERSION` (set by the web image), `undefined` in local development. */
export function appVersion(): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"] || undefined;
}

/**
 * The lines not seen yet, given the count the rule before kept (US-DEV-06): lines were only prepended then, so the unseen
 * ones are the first `total - seen`. A count above `total` means that lines were taken back: every line left is new.
 */
function unseenOf(total: number, seen: number): number {
  return seen > total ? total : total - seen;
}

/**
 * The keys of the lines this device has seen (US-QS-27). Nothing stored is a first visit: every line counts as seen and the
 * keys are recorded, so a new keeper does not get the old lines. The count of the rule before (US-DEV-06) is migrated once:
 * its first `unseenOf(total, count)` lines stay unseen, the rest count as seen. Storage that cannot be written counts every
 * line as seen as well, so the banner never comes back on every visit (the price: a device without storage never sees it).
 */
function seenKeys(): Set<string> {
  const stored = parseKeys(readStored(SEEN_KEY));
  if (stored !== null) return new Set(stored);
  const legacy = readStored(LEGACY_SEEN_KEY);
  const keys =
    legacy !== undefined && /^\d+$/.test(legacy)
      ? ALL_KEYS.slice(unseenOf(ALL_KEYS.length, Number(legacy)))
      : [...ALL_KEYS];
  writeStored(SEEN_KEY, JSON.stringify(capSeen(keys, new Set(ALL_KEYS))));
  if (legacy !== undefined) removeStored(LEGACY_SEEN_KEY);
  return new Set(keys);
}

/** The lines this device has not seen, in display order, by identity (US-QS-27, US-DEV-06). */
export function unseenEntries(): NewsEntry[] {
  const seen = seenKeys();
  return KEYED.filter((item) => !seen.has(item.key)).map((item) => item.entry);
}

/** Records keys as seen (US-QS-27). `false` when storage is unavailable. */
export function markKeysSeen(keys: readonly string[]): boolean {
  const merged = [...seenKeys()];
  const have = new Set(merged);
  for (const key of keys) {
    if (!have.has(key)) {
      have.add(key);
      merged.push(key);
    }
  }
  return writeStored(SEEN_KEY, JSON.stringify(capSeen(merged, new Set(ALL_KEYS))));
}

/** Every line counts as seen, for example when the page "Neu in PflanzenDéx" was opened (US-DEV-06, US-QS-27). */
export function markAllNewsSeen(): boolean {
  const recorded = markKeysSeen(ALL_KEYS);
  clearPending();
  return recorded;
}

/** The keys of the batch the banner showed and that has not ended (US-QS-27). */
function readPending(): string[] {
  return parseKeys(readStored(PENDING_KEY)) ?? [];
}

function clearPending(): void {
  writeStored(PENDING_KEY, "[]");
}

/** Whether the banner has shown in this browser tab's session (US-QS-27). */
function inSession(): boolean {
  return readSessionStored(SESSION_KEY) === "1";
}

/**
 * The lines the banner on "Heute" shows (US-QS-27), decided once when the calm setting is known as off. In the session in
 * which the banner first shows, it shows again on every visit of "Heute" (the lines stay unseen until the keeper ends it).
 * In a later session, a batch that was shown before counts as seen and does not return; lines that came after it show as
 * a new batch. Nothing is shown and nothing is recorded when every line is seen already.
 */
export function bannerBatch(): NewsEntry[] {
  let unseen = unseenEntries();
  if (unseen.length === 0) {
    clearPending();
    return [];
  }
  if (!inSession()) {
    const pending = readPending();
    if (pending.length > 0) {
      markKeysSeen(pending);
      clearPending();
      unseen = unseenEntries();
      if (unseen.length === 0) return [];
    }
  }
  writeStored(PENDING_KEY, JSON.stringify(unseen.map((entry) => lineKey(entry.text))));
  writeSessionStored(SESSION_KEY, "1");
  return unseen;
}

/**
 * The keeper ended the banner, by "Neuerungen ansehen" or "Hinweis ausblenden" (US-QS-27): its lines count as seen now, on
 * this visit and on every later one.
 */
export function endBanner(batch: readonly NewsEntry[]): boolean {
  const recorded = markKeysSeen(batch.map((entry) => lineKey(entry.text)));
  clearPending();
  return recorded;
}
