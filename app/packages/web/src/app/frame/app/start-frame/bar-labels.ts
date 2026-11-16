import { useEffect } from "react";
import {
  BAR_SLOTS,
  DEFAULT_BAR_LABELS,
  barLabelsOf,
  type NavItem,
} from "@/shared/patterns/navigation/nav-item";
import { readStored, writeStored } from "@/shared/platform/browser/storage";

/** The labels of the bottom bar as the shell showed them last on this device (issue 2230, DS-10). */
export const BAR_LABELS_KEY = "pflanzendex.bar-labels";

/** Longest label the start frame takes from storage: a stored value that is no label of the bar is not trusted. */
const MAX_LABEL = 40;

/**
 * The labels the start frame draws in its bottom bar (issue 2230): the labels the shell stored, so the words and the height of
 * the bar match the account's bar; without a usable stored list the default destinations of a plain keeper.
 */
export function startBarLabels(): string[] {
  try {
    const list: unknown = JSON.parse(readStored(BAR_LABELS_KEY) ?? "null");
    if (
      Array.isArray(list) &&
      list.length > 0 &&
      list.length <= BAR_SLOTS &&
      list.every(
        (label) => typeof label === "string" && label.length > 0 && label.length <= MAX_LABEL,
      )
    )
      return list as string[];
  } catch {
    // An unreadable value is no list: the defaults show (the shell writes a new one on its next render).
  }
  return DEFAULT_BAR_LABELS;
}

/** The shell remembers the labels of its bottom bar when they change, so the start frame draws the same words (issue 2230). */
export function useRememberBarLabels(items: readonly NavItem[]): void {
  const labels = JSON.stringify(barLabelsOf(items));
  useEffect(() => {
    writeStored(BAR_LABELS_KEY, labels);
  }, [labels]);
}
