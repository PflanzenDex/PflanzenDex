/**
 * The one register of keyboard shortcuts (US-QS-11, DS-70): the starting set and its build-time guard. The keys and their
 * matching live in `keys.ts`; the actions run in `shortcut-provider/`, and the targets of the navigating ones in the app
 * frame. A key the browser, the operating system or a screen reader uses is rejected here (guardrail).
 */
import { isReservedKeyName, isShortcutKey, reservedReason, type ShortcutKey } from "./keys";

/** Every shortcut of the app (starting set, assumption, US-QS-11). The overview is `?`, search `/`. */
export const SHORTCUT_IDS = [
  "overview",
  "search",
  "today",
  "collection",
  "species",
  "wishlist",
] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export type ShortcutSpec = { readonly id: ShortcutId; readonly key: ShortcutKey };

/**
 * The guard of the register (US-QS-11): throws for a reserved key, for a key that is no letter, `?` or `/`, for an
 * unknown id and for a key or an id that is given twice. It runs over the built register at module load and in the
 * unit test, so a reserved key added to the register fails the build.
 */
export function defineShortcuts(specs: readonly ShortcutSpec[]): readonly ShortcutSpec[] {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const spec of specs) {
    const key: string = spec.key;
    if (isReservedKeyName(key) || reservedReason({ key }) !== null)
      throw new Error(`Shortcut key "${key}" is reserved: ${reservedReason({ key })}`);
    if (!isShortcutKey(key))
      throw new Error(`"${key}" is not a shortcut key: use one letter, "?" or "/"`);
    if (!(SHORTCUT_IDS as readonly string[]).includes(spec.id))
      throw new Error(`"${spec.id}" is not a shortcut id`);
    if (keys.has(key)) throw new Error(`Shortcut key "${key}" is given twice`);
    if (ids.has(spec.id)) throw new Error(`Shortcut "${spec.id}" is given twice`);
    keys.add(key);
    ids.add(spec.id);
  }
  return specs;
}

/** The starting set (assumption, US-QS-11); the targets of the actions live in the app frame, not here. */
export const REGISTER: readonly ShortcutSpec[] = defineShortcuts([
  { id: "overview", key: "?" },
  { id: "search", key: "/" },
  { id: "today", key: "h" },
  { id: "collection", key: "s" },
  { id: "species", key: "p" },
  { id: "wishlist", key: "w" },
]);

/** The key of a shortcut id, for the hint of its control and for the overview. */
export const KEY_OF: Readonly<Record<ShortcutId, ShortcutKey>> = Object.fromEntries(
  REGISTER.map((s) => [s.id, s.key]),
) as Record<ShortcutId, ShortcutKey>;
