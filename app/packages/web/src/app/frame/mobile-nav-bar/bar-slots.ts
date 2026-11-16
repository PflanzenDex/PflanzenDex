import { useEffect } from "react";
import {
  BAR_SLOTS,
  MORE_LABEL,
  type BarSlot,
  type NavItem,
} from "@/shared/patterns/navigation/nav-item";
import { writeStored } from "@/shared/platform/browser/storage";
import { BAR_LABELS_KEY } from "../app/start-frame/bar-labels";

/**
 * Entdecken, the destination that moves into "Mehr" at a large text size (SG-NAV-07, issue 2249). Here and not in nav-item.ts:
 * the start frame imports nav-item.ts, so what lives there is in the initial JavaScript; the slots are the shell's alone.
 */
const DISCOVER_HREF = "/discover";

/**
 * The slots of the bottom bar for the destinations of a keeper (DS-25, SG-NAV-07, issue 2249). At normal text: the destinations,
 * or four and "Mehr" with the rest when they do not fit. Where Entdecken is in the bar at normal text, the large text takes the
 * destinations without it, four of them and "Mehr", and that "Mehr" holds Entdecken at its place in the order (owner
 * 2026-11-16). Every slot shows at both text sizes unless a layout differs from the other (`BAR_SHOW_CLASS`), and the
 * slots of both layouts are in one list, in an order that shows each layout in its own.
 */
export function barSlotsOf(items: readonly NavItem[]): BarSlot[] {
  const overflow = items.length > BAR_SLOTS;
  const normal = overflow ? items.slice(0, BAR_SLOTS - 1) : items;
  const split = normal.some((item) => item.href === DISCOVER_HREF);
  const large = split
    ? items.filter((item) => item.href !== DISCOVER_HREF).slice(0, BAR_SLOTS - 1)
    : normal;
  const slots: BarSlot[] = [];
  for (const item of items) {
    const inNormal = normal.includes(item);
    const inLarge = large.includes(item);
    if (inNormal || inLarge)
      slots.push({
        label: item.label,
        item,
        show: inNormal && inLarge ? "always" : inNormal ? "normal" : "large",
      });
  }
  if (overflow)
    slots.push({
      label: MORE_LABEL,
      show: split ? "normal" : "always",
      drawer: items.slice(BAR_SLOTS - 1),
    });
  if (split)
    slots.push({
      label: MORE_LABEL,
      show: "large",
      drawer: items.filter((item) => !large.includes(item)),
    });
  return slots;
}

/** The shell remembers the slots of its bottom bar when they change, so the start frame draws the same words and layouts (issue 2230, issue 2249). */
export function useRememberBarSlots(items: readonly NavItem[]): void {
  const slots = JSON.stringify(barSlotsOf(items).map(({ label, show }) => ({ label, show })));
  useEffect(() => {
    writeStored(BAR_LABELS_KEY, slots);
  }, [slots]);
}
