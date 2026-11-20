import {
  BAR_SLOTS,
  DEFAULT_BAR_SLOTS,
  type BarShow,
  type BarSlotLabel,
} from "@/shared/patterns/navigation/nav-item";
import { readStored } from "@/shared/platform/browser/storage";

/** The slots of the bottom bar as the shell showed them last on this device (issue 2230, issue 2249, DS-10). */
export const BAR_LABELS_KEY = "pflanzendex.bar-labels";

/** Longest label the start frame takes from storage: a stored value that is no label of the bar is not trusted. */
const MAX_LABEL = 40;
/** The most slots a stored list may hold: the five of each text size, the two "Mehr" slots included (issue 2249). */
const MAX_SLOTS = 2 * BAR_SLOTS;
const SHOWS: readonly BarShow[] = ["always", "normal", "large"];

/** A stored slot is a label and the text size it shows at; anything else is no slot of the bar. */
function isSlot(value: unknown): value is BarSlotLabel {
  if (typeof value !== "object" || value === null) return false;
  const { label, show } = value as Partial<BarSlotLabel>;
  return (
    typeof label === "string" &&
    label.length > 0 &&
    label.length <= MAX_LABEL &&
    SHOWS.includes(show as BarShow)
  );
}

/**
 * The slots the start frame draws in its bottom bar (issue 2230, issue 2249): the slots the shell stored, so the words, the height
 * and both layouts of the bar match the account's bar; without a usable stored list the default slots of a plain keeper.
 */
export function startBarSlots(): BarSlotLabel[] {
  try {
    const list: unknown = JSON.parse(readStored(BAR_LABELS_KEY) ?? "null");
    if (Array.isArray(list) && list.length > 0 && list.length <= MAX_SLOTS && list.every(isSlot))
      return list;
  } catch {
    // An unreadable value is no list: the defaults show (the shell writes a new one on its next render).
  }
  return DEFAULT_BAR_SLOTS;
}
