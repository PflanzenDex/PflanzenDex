// The keys of the changelog lines (US-QS-27, US-DEV-06): a short hash of each line's text, the parsing of the stored
// keys and their cap. Pure functions, no storage: whats-new.ts keeps the seen state on this device.

/**
 * The key of a line: a short hash of its text (cyrb53, 53 bits). A line keeps its key when a release moves it into a version,
 * and a line keeps its place in the seen set whatever its position in the list is (US-QS-27).
 */
export function lineKey(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The most line keys kept per device (starting value, assumption, US-QS-27): the oldest go first when there are more. */
export const SEEN_CAP = 1000;

/** The stored list of keys, or `null` when nothing (or no list of strings) is stored. */
export function parseKeys(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((key) => typeof key === "string") ? value : null;
  } catch {
    return null;
  }
}

/**
 * The stored keys capped at `cap` (US-QS-27): when there are more, the keys of lines that are no longer in the list go
 * first, then the oldest keys.
 */
export function capSeen(
  keys: readonly string[],
  current: ReadonlySet<string>,
  cap: number = SEEN_CAP,
): string[] {
  if (keys.length <= cap) return [...keys];
  let excess = keys.length - cap;
  const drop = new Set<string>();
  for (const key of keys) {
    if (excess === 0) break;
    if (!current.has(key)) {
      drop.add(key);
      excess--;
    }
  }
  for (const key of keys) {
    if (excess === 0) break;
    if (!drop.has(key)) {
      drop.add(key);
      excess--;
    }
  }
  return keys.filter((key) => !drop.has(key));
}
