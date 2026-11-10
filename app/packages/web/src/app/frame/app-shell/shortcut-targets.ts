import type { ShortcutId } from "@/shared/platform/device/keyboard/register";
import type {
  KeyHint,
  ShortcutTargets,
} from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import {
  CATALOG_ADDRESS,
  PATHS,
  SPECIES_MODE_ADDRESS,
  WISHLIST_MODE_ADDRESS,
} from "../../../shared/patterns/navigation/navigation/navigation";

/**
 * Where the navigating shortcuts lead (US-QS-11): the addresses of the views' own controls. `/` opens the catalog when the
 * view has no search field of its own.
 */
export const SHORTCUT_TARGETS: ShortcutTargets = {
  search: CATALOG_ADDRESS,
  today: PATHS.today,
  collection: PATHS.collection,
  species: SPECIES_MODE_ADDRESS,
  wishlist: WISHLIST_MODE_ADDRESS,
};

/** The shortcut of a destination of the navigation, by its address: the desktop navigation shows its key (US-QS-11). */
export const SHORTCUT_OF_HREF: Readonly<Record<string, ShortcutId>> = {
  [PATHS.today]: "today",
  [PATHS.collection]: "collection",
};

/** The key hint of the destination at `href` in the current mode (US-QS-11); `undefined` for a destination without a shortcut. */
export function navigationHint(
  hint: (id: ShortcutId) => KeyHint | undefined,
  href: string,
): KeyHint | undefined {
  const id = SHORTCUT_OF_HREF[href];
  return id ? hint(id) : undefined;
}
