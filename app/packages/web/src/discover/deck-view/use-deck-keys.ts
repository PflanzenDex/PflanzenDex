import type { KeyboardEvent } from "react";
import { isTextTarget } from "@/shared/platform/device/keyboard/keys";
import { useViewKeys, type ViewKeyRow } from "@/shared/platform/device/keyboard/view-keys";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../discover.de.json";

const t = texts(table);

/** The arrow keys fly the card the way the swipe would: right Yes, left No, up or down Later (US-ENT-10). */
const ARROWS: Readonly<Record<string, SwipeDirection>> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
};
const UNDO_KEY = "Backspace";

/** The keys of the deck as the shortcut overview lists them (US-QS-11); stable, so the overview is not set again. */
const ROWS: readonly ViewKeyRow[] = [
  { id: "deck-yes", keys: t("keys.yes"), label: t("deck.yes") },
  { id: "deck-no", keys: t("keys.no"), label: t("deck.no") },
  { id: "deck-later", keys: t("keys.later"), label: t("deck.later") },
  { id: "deck-undo", keys: t("keys.undo"), label: t("deck.undo") },
];

/**
 * The local keys of the deck (US-ENT-10): they act only while the deck has the focus (the card or one of its buttons),
 * never in a text field and never with a modifier, so browser and screen reader keys stay theirs. They are no global
 * shortcuts and work whatever the shortcut mode is; every key has its button. `onFly` is missing where no card is shown,
 * `onUndo` where "Rückgängig" is not offered: the key then does nothing.
 */
export function useDeckKeys(on: {
  onFly?: ((direction: SwipeDirection) => void) | undefined;
  onUndo?: (() => void) | undefined;
}) {
  useViewKeys(ROWS);
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isTextTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === UNDO_KEY) {
      if (on.onUndo === undefined) return;
      event.preventDefault();
      on.onUndo();
      return;
    }
    const direction = ARROWS[event.key];
    if (direction === undefined || on.onFly === undefined) return;
    event.preventDefault();
    on.onFly(direction);
  };
}
